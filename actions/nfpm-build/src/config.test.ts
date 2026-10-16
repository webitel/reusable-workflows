import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as core from '@actions/core';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigGenerator, ContentFileParser, FileValidator } from './config';
import { ContentFile } from './config';

// Mock @actions/core
vi.mock('@actions/core', () => ({
    info: vi.fn(),
    warning: vi.fn(),
    startGroup: vi.fn(),
    endGroup: vi.fn(),
    getInput: vi.fn(),
}));

describe('ContentFileParser', () => {
    describe('parseKeyValueFormat', () => {
        it('should parse key-value format correctly', () => {
            const input = `
src=./app dst=/usr/bin/app type=file mode=0755
src=./config.conf dst=/etc/app/config.conf type=config mode=0644 owner=app group=app
`;

            const result = ContentFileParser.parse(input.trim());
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                src: './app',
                dst: '/usr/bin/app',
                type: 'file',
                file_info: {
                    mode: 493 // octal: 0o755
                }
            });

            expect(result[1]).toEqual({
                src: './config.conf',
                dst: '/etc/app/config.conf',
                type: 'config',
                file_info: {
                    mode: 420,
                    owner: 'app',
                    group: 'app'
                }
            });
        });

        it('should handle quoted values', () => {
            const input = `src="./my app" dst="/usr/bin/my app" type='file' mode='0755'`;

            const result = ContentFileParser.parse(input);

            expect(result).toHaveLength(1);
            expect(result[0].src).toBe('./my app');
            expect(result[0].dst).toBe('/usr/bin/my app');
            expect(result[0].type).toBe('file');
            expect(result[0].file_info?.mode).toBe(493);
        });

        it('should handle files without file_info properties', () => {
            const input = `src=./app dst=/usr/bin/app type=file`;

            const result = ContentFileParser.parse(input);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                src: './app',
                dst: '/usr/bin/app',
                type: 'file'
            });
            expect(result[0].file_info).toBeUndefined();
        });

        it('should throw error for invalid type', () => {
            const input = `src=./app dst=/usr/bin/app type=invalid`;

            expect(() => ContentFileParser.parse(input)).toThrow('Invalid type "invalid"');
        });

        it('should parse tree type correctly', () => {
            const input = `src=./dist dst=/opt/www/app type=tree`;

            const result = ContentFileParser.parse(input);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                src: './dist',
                dst: '/opt/www/app',
                type: 'tree'
            });
        });

        it('should throw error for missing required properties', () => {
            const input = `src=./app mode=0755`; // missing dst

            expect(() => ContentFileParser.parse(input)).toThrow('must have both \'src\' and \'dst\' properties');
        });

        it('should default to file type when not specified', () => {
            const input = `src=./app dst=/usr/bin/app`;

            const result = ContentFileParser.parse(input);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBeUndefined();
        });

        it('should create file_info once when several file_info keys are set', () => {
            const result = ContentFileParser.parse('src=./app dst=/usr/bin/app group=app mode=0750 owner=app');

            expect(result[0].file_info).toEqual({ mode: 0o750, owner: 'app', group: 'app' });
        });

        it('should warn about unknown keys', () => {
            const result = ContentFileParser.parse('src=./app dst=/usr/bin/app color=red');

            expect(result).toHaveLength(1);
            expect(core.warning).toHaveBeenCalledWith('Unknown key "color" in content file definition');
        });

        it('should throw error for a line without key-value pairs', () => {
            expect(() => ContentFileParser.parse('./app /usr/bin/app')).toThrow('Invalid key-value format: "./app /usr/bin/app"');
        });

        it('should log owner only when both owner and group are set', () => {
            ContentFileParser.parse('src=./app dst=/usr/bin/app owner=app');

            expect(core.info).toHaveBeenCalledWith('  ./app -> /usr/bin/app (file)');
        });
    });

    describe('edge cases', () => {
        it('should return empty array for empty input', () => {
            expect(ContentFileParser.parse('')).toEqual([]);
            expect(ContentFileParser.parse('   ')).toEqual([]);
        });
    });
});

describe('FileValidator', () => {
    it('should skip symlink sources, which point into the target system', async () => {
        const files: ContentFile[] = [
            { src: '/usr/local/bin/does-not-exist', dst: '/opt/link', type: 'symlink' },
        ];

        await expect(FileValidator.validateSourceFiles(files)).resolves.toBeUndefined();
    });

    it('should fail when a file source is missing', async () => {
        const files: ContentFile[] = [{ src: 'does-not-exist', dst: '/usr/bin/x' }];

        await expect(FileValidator.validateSourceFiles(files)).rejects.toThrow('Source file not found: does-not-exist');
    });

    it('should pass when a file source exists', async () => {
        const files: ContentFile[] = [{ src: 'package.json', dst: '/usr/share/x/package.json' }];

        await expect(FileValidator.validateSourceFiles(files)).resolves.toBeUndefined();
        expect(core.info).toHaveBeenCalledWith('✅ Found: package.json');
    });
});

describe('ConfigGenerator', () => {
    let dir: string;
    let configFile: string;

    const setInputs = (inputs: Record<string, string>) => {
        vi.mocked(core.getInput).mockImplementation((name: string) => inputs[name] ?? '');
    };

    const generate = async (contentFiles: ContentFile[] = []): Promise<string> => {
        await ConfigGenerator.generateNFPMConfig(configFile, contentFiles);
        return fs.readFile(configFile, 'utf8');
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nfpm-config-'));
        configFile = path.join(dir, 'nfpm.yaml');
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('should apply defaults for optional inputs', async () => {
        setInputs({
            'package-name': 'app',
            'package-description': 'An app',
            'maintainer': 'Dev <dev@example.com>',
            'version': '1.2.3',
        });

        expect(await generate()).toBe([
            'name: app',
            'description: An app',
            'vendor: ""',
            'maintainer: Dev <dev@example.com>',
            'homepage: ""',
            'license: ""',
            'arch: amd64',
            'platform: linux',
            'section: default',
            'priority: optional',
            'version: 1.2.3',
            'release: "1"',
            'prerelease: ""',
            'version_metadata: ""',
            'umask: 0o2',
            '',
        ].join('\n'));
    });

    it('should render dependencies, contents and scripts with unquoted octal modes', async () => {
        setInputs({
            'package-name': 'app',
            'package-description': 'An app',
            'vendor': 'Webitel',
            'maintainer': 'Dev <dev@example.com>',
            'homepage': 'https://example.com',
            'license': 'MIT',
            'arch': 'arm64',
            'platform': 'linux',
            'section': 'net',
            'priority': 'extra',
            'version': '1.2.3',
            'release': '2',
            'prerelease': 'rc1',
            'version-metadata': 'git',
            'umask': '022',
            'depends': 'libc6, , curl',
            'recommends': 'ca-certificates',
            'suggests': 'jq',
            'conflicts': 'app-legacy',
            'replaces': 'app-legacy',
            'provides': 'app-server',
            'scripts': 'postinstall: ./postinstall.sh\npreremove: ./preremove.sh',
        });

        const yamlContent = await generate([
            { src: './app', dst: '/usr/bin/app', file_info: { mode: 0o755 } },
            { src: './app.conf', dst: '/etc/app.conf', type: 'config', file_info: { mode: 0o644, owner: 'app', group: 'app' } },
            { src: './app.env', dst: '/etc/app.env', type: 'config', file_info: { mode: 0o644 } },
        ]);

        expect(yamlContent).toContain('umask: 0o22\n');
        expect(yamlContent).toContain('depends:\n  - libc6\n  - curl\n');
        expect(yamlContent).toContain('provides:\n  - app-server\n');
        expect(yamlContent).toContain('scripts:\n  postinstall: ./postinstall.sh\n  preremove: ./preremove.sh\n');
        expect(yamlContent.match(/mode: 0o644\n/g)).toHaveLength(2);
        expect(yamlContent).toContain('mode: 0o755\n');
        expect(yamlContent).not.toContain('PLACEHOLDER');
        expect(core.warning).not.toHaveBeenCalled();
    });

    it('should skip dependency inputs that contain no names', async () => {
        setInputs({ 'depends': ' , ', 'recommends': '   ' });

        const yamlContent = await generate();

        expect(yamlContent).not.toContain('depends');
        expect(yamlContent).not.toContain('recommends');
    });

    it('should fall back to the default umask when the input is not octal', async () => {
        setInputs({ 'umask': 'abc' });

        expect(await generate()).toContain('umask: 0o2\n');
    });

    it('should warn about unknown script keys', async () => {
        setInputs({ 'scripts': 'postinstall: ./postinstall.sh\npostupgrade: ./postupgrade.sh' });

        expect(await generate()).toContain('postupgrade: ./postupgrade.sh');
        expect(core.warning).toHaveBeenCalledWith('Unknown script key: postupgrade. Valid keys are: preinstall, postinstall, preremove, postremove');
    });

    it('should reject scripts that are not a YAML object', async () => {
        setInputs({ 'scripts': 'just-a-string' });

        await expect(generate()).rejects.toThrow('Failed to parse scripts: Scripts must be a YAML object');
    });
});
