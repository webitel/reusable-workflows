# nFPM Action

A GitHub Action to generate nFPM configuration files and build packages (DEB, RPM, APK, Arch Linux) using [nFPM](https://nFPM.goreleaser.com/).

## Features

- 🚀 Generate nFPM config from GitHub Action inputs
- 📦 Build multiple package formats (DEB, RPM, APK, Arch Linux)
- 🔧 Support for dependencies, scripts, and complex package metadata
- ✅ Validates source files before building
- 🎯 Flexible content specification (YAML or key-value format)
- 🏗️ Written in TypeScript for reliability
- 📋 Comprehensive error handling and logging

## Usage

### Basic Example

```yaml
name: Build Package

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build Package
        uses: webitel/reusable-workflows/actions/nFPM-build-action@main
        with:
          package-name: 'my-app'
          version: '1.0.0'
          package-description: 'My awesome application'
          maintainer: 'Your Name <your.email@example.com>'
          homepage: 'https://github.com/your-username/my-app'
          contents: |
            src=./build/my-app dst=/usr/bin/my-app type=file
            src=./config/my-app.conf dst=/etc/my-app/my-app.conf type=config
          
          depends: 'libc6, libssl3'
```

### Advanced Example

```yaml
- name: Build Multi-format Packages
  uses: webitel/reusable-workflows/actions/nFPM-build-action@main
  with:
    package-name: 'my-service'
    version: '${{ github.ref_name }}'
    package-description: 'My awesome service'
    maintainer: 'DevOps Team <devops@company.com>'
    homepage: 'https://github.com/company/my-service'
    license: 'MIT'
    vendor: 'My Company'
    arch: 'amd64'
    formats: 'deb,rpm,apk'
    depends: 'systemd'
    recommends: 'nginx'
    suggests: 'postgresql-client'
    contents: |
      - src: './dist/my-service'
        dst: '/usr/bin/my-service'
        type: 'file'
        mode: '0755'
      - src: './systemd/my-service.service'
        dst: '/etc/systemd/system/my-service.service'
        type: 'config'
        mode: '0644'
      - src: './config/'
        dst: '/etc/my-service/'
        type: 'dir'
        mode: '0755'
    
    scripts: |
      postinstall: |
        systemctl daemon-reload
        systemctl enable my-service
      preremove: |
        systemctl stop my-service
        systemctl disable my-service
```

## Inputs and Outputs

This action provides numerous configuration options for package generation. For a complete and up-to-date list of all available inputs with their descriptions, default values, and examples, please refer to the [`action.yml`](./action.yml) file in this repository.

### Key Inputs

- `nfpm-version`: Optional nFPM version to install
- `package-name`: Package name (required)
- `version`: Package version (required)
- `maintainer`: Package maintainer (required)
- `formats`: Package formats to generate (default: `deb`)
- `contents`: File contents to include in the package
- `scripts`: Scripts to run at specific package lifecycle stages

### Outputs

- `packages`: List of generated package files
- `config-file`: Path to the generated nFPM config file

## Contents Format

The `contents` input supports two formats:

### YAML Format (Recommended)

```yaml
contents: |
  - src: './build/my-app'
    dst: '/usr/bin/my-app'
    type: 'file'
    mode: '0755'
    owner: 'root'
    group: 'root'
  - src: './config/app.conf'
    dst: '/etc/my-app/app.conf'
    type: 'config'
    mode: '0644'
  - src: './data/'
    dst: '/var/lib/my-app/'
    type: 'dir'
    mode: '0755'
```

### Key-Value Format

```yaml
contents: |
  src=./build/my-app dst=/usr/bin/my-app type=file mode=0755
  src=./config/app.conf dst=/etc/my-app/app.conf type=config mode=0644
  src=./data/ dst=/var/lib/my-app/ type=dir mode=0755
```

### Content Properties

- `src` (required): Source file or directory path
- `dst` (required): Destination path in the package
- `type` (optional): Content type - `file`, `config`, `dir`, or `symlink` (default: `file`)
- `mode` (optional): File permissions in octal format (e.g., `0755`)
- `owner` (optional): File owner (default: `root`)
- `group` (optional): File group (default: `root`)

### Content Types

- `file`: Regular file
- `config`: Configuration file (handled specially by package managers)
- `dir`: Directory
- `symlink`: Symbolic link

## Package Formats

Supported package formats:

- `deb` - Debian/Ubuntu packages (.deb)
- `rpm` - Red Hat/CentOS/SUSE packages (.rpm)
- `apk` - Alpine Linux packages (.apk)
- `archlinux` - Arch Linux packages (.pkg.tar.xz)

## Examples

### Simple Binary Package

```yaml
- name: Build Simple Package
  uses: webitel/reusable-workflows/actions/nFPM-build-action@main
  with:
    package-name: 'hello-world'
    version: '1.0.0'
    package-description: 'A simple hello world application'
    maintainer: 'John Doe <john@example.com>'
    contents: 'src=./hello dst=/usr/bin/hello type=file mode=0755'
```

### Service with Systemd

```yaml
- name: Build Service Package
  uses: webitel/reusable-workflows/actions/nFPM-build-action@main
  with:
    package-name: 'my-daemon'
    version: '2.1.0'
    package-description: 'My background service'
    maintainer: 'Team <team@company.com>'
    license: 'Apache-2.0'
    depends: 'systemd'
    formats: 'deb,rpm'
    contents: |
      - src: './build/my-daemon'
        dst: '/usr/bin/my-daemon'
        type: 'file'
        mode: '0755'
      - src: './systemd/my-daemon.service'
        dst: '/etc/systemd/system/my-daemon.service'
        type: 'config'
        mode: '0644'
      - src: './config/my-daemon.conf'
        dst: '/etc/my-daemon/my-daemon.conf'
        type: 'config'
        mode: '0644'
    
    scripts: |
      postinstall: |
        systemctl daemon-reload
        systemctl enable my-daemon
      preremove: |
        systemctl stop my-daemon
        systemctl disable my-daemon
```

### Multi-Architecture Build

```yaml
strategy:
  matrix:
    arch: [amd64, arm64, armhf]
    
steps:
  - name: Build Package for ${{ matrix.arch }}
    uses: webitel/reusable-workflows/actions/nFPM-build-action@main
    with:
      package-name: 'my-app'
      version: '1.0.0'
      package-description: 'Cross-platform application'
      maintainer: 'Developer <dev@example.com>'
      arch: ${{ matrix.arch }}
      contents: 'src=./build/${{ matrix.arch }}/my-app dst=/usr/bin/my-app type=file mode=0755'
```

### Using Pre-installed nFPM

```yaml
- name: Install nFPM
  run: |
    wget -O nFPM.deb https://github.com/goreleaser/nFPM/releases/download/v2.35.3/nFPM_2.35.3_Linux_x86_64.deb
    sudo dpkg -i nFPM.deb

- name: Build Package
  uses: webitel/reusable-workflows/actions/nFPM-build-action@main
  with:
    skip-install: true
    package-name: 'my-app'
    version: '1.0.0'
    package-description: 'My application'
    maintainer: 'Me <me@example.com>'
    contents: 'src=./app dst=/usr/bin/app type=file mode=0755'
```

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
# Install dependencies
npm install

# Build the action
npm run build

# Run linting
npm run lint

# Run tests
npm run test

# Run tests once (CI mode)
npm run test:run

# Run tests with coverage
npm run test:coverage
```

### Building

The action uses TypeScript and Vitest for testing. After making changes:

```bash
npm run build
```

This will:
1. Compile TypeScript to JavaScript in `dist/`
2. Bundle everything into a single `dist/index.js` file using `ncc`

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `npm run build` to compile
6. Commit both source and compiled changes
7. Create a pull request

## License

MIT

## Troubleshooting

### Common Issues

1. **Source file not found**: Ensure all source files specified in `contents` exist before running the action.

2. **Invalid package format**: Check that the `formats` input contains only supported formats: `deb`, `rpm`, `apk`, `archlinux`.

3. **nFPM installation fails**:
    - Check if the specified `nFPM-version` exists in the [nFPM releases](https://github.com/goreleaser/nFPM/releases)
    - Try using `skip-install: true` and install nFPM manually

4. **Package build fails**:
    - Verify that all required inputs are provided
    - Check the generated config file for syntax errors
    - Ensure content files format is correct

5. **Permission errors**: Make sure file modes are specified in octal format (e.g., `0755`, not `755`).

### Debug Mode

Enable debug logging by setting the `ACTIONS_STEP_DEBUG` secret to `true` in your repository settings.

### nFPM Documentation

For advanced nFPM configuration options, refer to the [official nFPM documentation](https://nFPM.goreleaser.com/).

## Related Projects

- [nFPM](https://nFPM.goreleaser.com/) - The underlying tool used for package building
- [GoReleaser](https://goreleaser.com/) - Complete release automation tool that includes nFPM
