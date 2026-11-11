# If you need to use a different base image, please choose the linux/amd64 platform variant and include the fingerprint so that we pin the exact image.
FROM ubuntu:24.04@sha256:c35e29c9450151419d9448b0fd75374fec4fff364a27f176fb458d472dfc9e54
ENV DEBIAN_FRONTEND=noninteractive

# These are support tools that should go into all tasks. Don't alter these unless you need to adjust for a different base image.
RUN apt-get update && apt-get install -y git python3 python3-pip bash curl wget && rm -rf /var/lib/apt/lists/*
RUN ln -sf /usr/bin/python3 /usr/bin/python
RUN mkdir -p /logs
RUN apt-get update && apt-get install -y python3-venv python3-dev && rm -rf /var/lib/apt/lists/*
ENV PIP_BREAK_SYSTEM_PACKAGES=1

# The WORKDIR should always be /app
WORKDIR /app

# --- Task-specific system packages go here, merged into one apt line, e.g.:
RUN apt-get update && apt-get install -y xz-utils ca-certificates && rm -rf /var/lib/apt/lists/*

# Node.js 22 (Next.js 16 needs Node >= 20.9; Ubuntu 24.04's apt nodejs is too old).
# Pinned official tarball for linux-x64.
ENV NODE_VERSION=22.19.0
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && node --version && npm --version
ENV NEXT_TELEMETRY_DISABLED=1

# Local codebase: /app/gen_img_fe (source, read-only reference) and /app/tool_znak_fe (target).
COPY codebase/ .
# Nested repos would become gitlinks and hide the agent's edits from patch.diff, and could leak history.
RUN find /app -name .git -not -path '/app/.git' -not -path '*/node_modules/*' -prune -exec rm -rf {} +

# Install the target's dependencies. The source repo is only read, so it is not installed.
# @xyflow/react (the canvas library the source uses) is added here, before the checkpoint: the agent has no
# network to install it and the task forbids editing package.json, so it is part of the starting state.
RUN cd /app/tool_znak_fe && npm ci --no-audit --no-fund \
    && npm install --save-exact --no-audit --no-fund @xyflow/react@12.11.2

# Inject the build-artifact .gitignore so those files stay out of the captured
# patch.diff.
COPY gitignore /tmp/harbor.gitignore
RUN cat /tmp/harbor.gitignore >> .gitignore && rm /tmp/harbor.gitignore
# Safety net: never let installed/built artifacts into the checkpoint or the patch.
RUN printf '%s\n' 'node_modules/' '.next/' 'tsconfig.tsbuildinfo' '.DS_Store' >> .gitignore

# Checkpoint the starting state as tag v0.1.0-init (test.sh diffs against it).
# Steps are ';'-separated (the commit may no-op) so the tag lands whether or not
# git was already initialized and whether or not the tree has uncommitted changes.
RUN git config --global user.email "eval@bench"; \
    git config --global user.name "Eval Runner"; \
    git init; \
    git add -A; \
    git commit -m "initialize repo" || true; \
    git tag v0.1.0-init
CMD ["bash"]
