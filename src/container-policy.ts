/**
 * Container mount & secret policy for NanoClaw
 *
 * The security-relevant surface of container spawning, isolated from process
 * lifecycle (see container-runner.ts). Two responsibilities:
 *   - buildVolumeMounts: what host paths are exposed to a container, and r/o vs r/w
 *   - buildContainerArgs: env injection (incl. the credential-proxy routing and
 *     the YNAB secret exception), user mapping, and mount-arg assembly
 *
 * Keeping this in its own module makes the "what can a container see / what
 * secrets does it get" question reviewable without reading 700 lines of
 * spawn/timeout/log-parsing code.
 */
import fs from 'fs';
import path from 'path';

import {
  CONTAINER_IMAGE,
  CREDENTIAL_PROXY_PORT,
  DATA_DIR,
  GROUPS_DIR,
  TIMEZONE,
} from './config.js';
import { resolveGroupFolderPath, resolveGroupIpcPath } from './group-folder.js';
import {
  getContainerHostGateway,
  hostGatewayArgs,
  readonlyMountArgs,
} from './container-runtime.js';
import { detectAuthMode } from './credential-proxy.js';
import { readEnvFile } from './env.js';
import { validateAdditionalMounts } from './mount-security.js';
import { RegisteredGroup } from './types.js';

export interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

export function buildVolumeMounts(
  group: RegisteredGroup,
  isMain: boolean,
): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const projectRoot = process.cwd();
  const groupDir = resolveGroupFolderPath(group.folder);

  if (isMain) {
    // Main gets the project root read-only. Writable paths the agent needs
    // (group folder, IPC, .claude/) are mounted separately below.
    // Read-only prevents the agent from modifying host application code
    // (src/, dist/, package.json, etc.) which would bypass the sandbox
    // entirely on next restart.
    mounts.push({
      hostPath: projectRoot,
      containerPath: '/workspace/project',
      readonly: true,
    });

    // .env shadowing is handled inside the container entrypoint via mount --bind.
    // Apple Container only supports directory mounts, so host-side /dev/null
    // overlay is not possible. The entrypoint starts as root, shadows .env,
    // then drops privileges via setpriv.

    // Main also gets its group folder as the working directory
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });
  } else {
    // Other groups only get their own folder
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });

    // Global memory directory (read-only for non-main)
    // Only directory mounts are supported, not file mounts
    const globalDir = path.join(GROUPS_DIR, 'global');
    if (fs.existsSync(globalDir)) {
      mounts.push({
        hostPath: globalDir,
        containerPath: '/workspace/global',
        readonly: true,
      });
    }
  }

  // Per-group Claude sessions directory (isolated from other groups)
  // Each group gets their own .claude/ to prevent cross-group session access
  const groupSessionsDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    '.claude',
  );
  fs.mkdirSync(groupSessionsDir, { recursive: true });
  const settingsFile = path.join(groupSessionsDir, 'settings.json');
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(
      settingsFile,
      JSON.stringify(
        {
          env: {
            // Enable agent swarms (subagent orchestration)
            // https://code.claude.com/docs/en/agent-teams#orchestrate-teams-of-claude-code-sessions
            CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
            // Load CLAUDE.md from additional mounted directories
            // https://code.claude.com/docs/en/memory#load-memory-from-additional-directories
            CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
            // Enable Claude's memory feature (persists user preferences between sessions)
            // https://code.claude.com/docs/en/memory#manage-auto-memory
            CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
          },
        },
        null,
        2,
      ) + '\n',
    );
  }

  // Sync skills from container/skills/ into each group's .claude/skills/
  const skillsSrc = path.join(process.cwd(), 'container', 'skills');
  const skillsDst = path.join(groupSessionsDir, 'skills');
  if (fs.existsSync(skillsSrc)) {
    for (const skillDir of fs.readdirSync(skillsSrc)) {
      const srcDir = path.join(skillsSrc, skillDir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const dstDir = path.join(skillsDst, skillDir);
      fs.cpSync(srcDir, dstDir, { recursive: true, dereference: true });
    }
  }
  // Also sync agent-created skills from the group folder (persistent across sessions)
  const agentSkillsSrc = path.join(groupDir, 'skills');
  if (fs.existsSync(agentSkillsSrc)) {
    for (const skillDir of fs.readdirSync(agentSkillsSrc)) {
      const srcDir = path.join(agentSkillsSrc, skillDir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const dstDir = path.join(skillsDst, skillDir);
      fs.cpSync(srcDir, dstDir, { recursive: true, dereference: true });
    }
  }
  mounts.push({
    hostPath: groupSessionsDir,
    containerPath: '/home/node/.claude',
    readonly: false,
  });

  // Per-group IPC namespace: each group gets its own IPC directory
  // This prevents cross-group privilege escalation via IPC
  const groupIpcDir = resolveGroupIpcPath(group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'input'), { recursive: true });
  mounts.push({
    hostPath: groupIpcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // Copy agent-runner source into a per-group writable location so agents
  // can customize it (add tools, change behavior) without affecting other
  // groups. Recompiled on container startup via entrypoint.sh.
  const agentRunnerSrc = path.join(
    projectRoot,
    'container',
    'agent-runner',
    'src',
  );
  const groupAgentRunnerDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    'agent-runner-src',
  );
  if (!fs.existsSync(groupAgentRunnerDir) && fs.existsSync(agentRunnerSrc)) {
    fs.cpSync(agentRunnerSrc, groupAgentRunnerDir, { recursive: true });
  }
  mounts.push({
    hostPath: groupAgentRunnerDir,
    containerPath: '/app/src',
    readonly: false,
  });

  // gws (Google Workspace CLI) authenticates via Google Application Default
  // Credentials, which live in ~/.config/gcloud/. Apple Container can't
  // bind-mount single files, so stage a fresh copy of just the ADC file (not
  // the whole gcloud dir, which holds broader gcloud CLI tokens) and mount it
  // at the well-known ADC path. ADC alone is sufficient: gws creates its own
  // config/token cache inside the container, so the host's ~/.config/gws is
  // not mounted (a writable mount lets containers clobber the host's token
  // cache with an incompatible encryption key).
  const adcFile = path.join(
    process.env.HOME || '/root',
    '.config',
    'gcloud',
    'application_default_credentials.json',
  );
  if (fs.existsSync(adcFile)) {
    const adcStagingDir = path.join(DATA_DIR, 'gcloud-adc');
    fs.mkdirSync(adcStagingDir, { recursive: true });
    fs.copyFileSync(
      adcFile,
      path.join(adcStagingDir, 'application_default_credentials.json'),
    );
    mounts.push({
      hostPath: adcStagingDir,
      containerPath: '/home/node/.config/gcloud',
      readonly: true,
    });
  } else {
    // Legacy fallback: gws OAuth credentials stored in its own config dir
    const gwsConfigDir = path.join(
      process.env.HOME || '/root',
      '.config',
      'gws',
    );
    if (fs.existsSync(gwsConfigDir)) {
      mounts.push({
        hostPath: gwsConfigDir,
        containerPath: '/home/node/.config/gws',
        readonly: false, // gws needs write access to refresh OAuth tokens
      });
    }
  }

  // Additional mounts validated against external allowlist (tamper-proof from containers)
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      group.containerConfig.additionalMounts,
      group.name,
      isMain,
    );
    mounts.push(...validatedMounts);
  }

  return mounts;
}

export function buildContainerArgs(
  mounts: VolumeMount[],
  containerName: string,
  isMain: boolean,
): string[] {
  const args: string[] = ['run', '-i', '--rm', '--name', containerName];

  // Pass host timezone so container's local time matches the user's
  args.push('-e', `TZ=${TIMEZONE}`);

  // gws stores its encryption key in the OS keyring by default; the container
  // has no keyring service, so force the file-backed key (.encryption_key).
  args.push('-e', 'GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file');

  // Route API traffic through the credential proxy (containers never see real secrets)
  args.push(
    '-e',
    `ANTHROPIC_BASE_URL=http://${getContainerHostGateway()}:${CREDENTIAL_PROXY_PORT}`,
  );

  // Mirror the host's auth method with a placeholder value.
  // API key mode: SDK sends x-api-key, proxy replaces with real key.
  // OAuth mode:   SDK exchanges placeholder token for temp API key,
  //               proxy injects real OAuth token on that exchange request.
  const authMode = detectAuthMode();
  if (authMode === 'api-key') {
    args.push('-e', 'ANTHROPIC_API_KEY=placeholder');
  } else {
    args.push('-e', 'CLAUDE_CODE_OAUTH_TOKEN=placeholder');
  }

  // Pass YNAB credentials if configured. NOTE: this is a real, full read-write
  // token in plaintext env. The ynab-readonly.sh wrapper blocks writes via the
  // `ynab` CLI but is NOT an adversarial boundary — the raw token can be used
  // directly (e.g. curl POST). See docs/SECURITY.md §5 "Exception". Accepted risk.
  const ynabEnv = readEnvFile(['YNAB_API_KEY', 'YNAB_ACCESS_TOKEN']);
  const ynabKey = ynabEnv.YNAB_API_KEY || ynabEnv.YNAB_ACCESS_TOKEN;
  if (ynabKey) {
    args.push('-e', `YNAB_API_KEY=${ynabKey}`);
  }

  // Runtime-specific args for host gateway resolution
  args.push(...hostGatewayArgs());

  // Run as host user so bind-mounted files are accessible.
  // Skip when running as root (uid 0), as the container's node user (uid 1000),
  // or when getuid is unavailable (native Windows without WSL).
  const hostUid = process.getuid?.();
  const hostGid = process.getgid?.();
  if (hostUid != null && hostUid !== 0 && hostUid !== 1000) {
    if (isMain) {
      // Main containers start as root so the entrypoint can mount --bind
      // to shadow .env. Privileges are dropped via setpriv in entrypoint.sh.
      args.push('-e', `RUN_UID=${hostUid}`);
      args.push('-e', `RUN_GID=${hostGid}`);
    } else {
      args.push('--user', `${hostUid}:${hostGid}`);
    }
    args.push('-e', 'HOME=/home/node');
  }

  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(...readonlyMountArgs(mount.hostPath, mount.containerPath));
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}
