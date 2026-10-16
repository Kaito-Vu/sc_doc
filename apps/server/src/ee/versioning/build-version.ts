// Identifies the deployed build. Injected at image build time:
//   BUILD_VERSION=$(git describe --tags --always --dirty) docker compose build
// e.g. "v0.96.0-227-gd067235f" = upstream tag + fork commits since + commit.
export const BUILD_VERSION = process.env.BUILD_VERSION || 'dev';
