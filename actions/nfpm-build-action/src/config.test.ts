import { describe, it, expect, vi } from 'vitest';
import { ContentFileParser } from './config';
import { ContentFile } from './config';

// Mock @actions/core
vi.mock('@actions/core', () => ({
    info: vi.fn(),
    warning: vi.fn()
}));

describe('ContentFileParser', () => {
    describe('parseYamlFormat', () => {
        it('should parse YAML array format correctly', () => {
            const yamlInput = `
- src: './app'
  dst: '/usr/bin/app'
  type: 'file'
  mode: 0755
- src: './config.conf'
  dst: '/etc/app/config.conf'
  type: 'config'
  mode: '0644'
  owner: 'app'
  group: 'app'
`;

            const result = ContentFileParser.parse(yamlInput.trim());

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                src: './app',
                dst: '/usr/bin/app',
                type: 'file',
                file_info: {
                    mode: '0755',
                    owner: undefined,
                    group: undefined
                }
            });
            expect(result[1]).toEqual({
                src: './config.conf',
                dst: '/etc/app/config.conf',
                type: 'config',
                file_info: {
                    mode: '0644',
                    owner: 'app',
                    group: 'app'
                }
            });
        });

        it('should parse YAML with file_info structure correctly', () => {
            const yamlInput = `
- src: './app'
  dst: '/usr/bin/app'
  type: 'file'
  file_info:
    mode: 0755
    owner: 'root'
    group: 'root'
`;

            const result = ContentFileParser.parse(yamlInput.trim());

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                src: './app',
                dst: '/usr/bin/app',
                type: 'file',
                file_info: {
                    mode: '0755',
                    owner: 'root',
                    group: 'root'
                }
            });
        });

        it('should parse YAML with contents key format correctly', () => {
            const yamlInput = `
contents:
  - src: './app'
    dst: '/usr/bin/app'
    type: 'file'
  - src: './logs'
    dst: '/var/log/app'
    type: 'dir'
`;

            const result = ContentFileParser.parse(yamlInput.trim());

            expect(result).toHaveLength(2);
            expect(result[0].type).toBe('file');
            expect(result[1].type).toBe('dir');
        });

        it('should throw error for invalid YAML', () => {
            const invalidYaml = `
- src: './app'
  dst: '/usr/bin/app'
- invalid: yaml: structure:
`;

            expect(() => ContentFileParser.parse(invalidYaml.trim())).toThrow();
        });

        it('should throw error for missing required properties', () => {
            const yamlInput = `
- src: './app'
  # missing dst
- dst: '/usr/bin/app2'
  # missing src
`;

            expect(() => ContentFileParser.parse(yamlInput.trim())).toThrow('must have \'src\' and \'dst\' properties');
        });

        it('should validate content types', () => {
            const yamlInput = `
- src: './app'
  dst: '/usr/bin/app'
  type: 'invalid-type'
`;

            expect(() => ContentFileParser.parse(yamlInput.trim())).toThrow('Invalid type "invalid-type"');
        });

        it('should default to file type when not specified', () => {
            const yamlInput = `
- src: './app'
  dst: '/usr/bin/app'
`;

            const result = ContentFileParser.parse(yamlInput.trim());

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('file');
        });
    });

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
                    mode: '0755'
                }
            });
            expect(result[1]).toEqual({
                src: './config.conf',
                dst: '/etc/app/config.conf',
                type: 'config',
                file_info: {
                    mode: '0644',
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
            expect(result[0].file_info?.mode).toBe('0755');
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

        it('should throw error for missing required properties', () => {
            const input = `src=./app mode=0755`; // missing dst

            expect(() => ContentFileParser.parse(input)).toThrow('must have both \'src\' and \'dst\' properties');
        });

        it('should default to file type when not specified', () => {
            const input = `src=./app dst=/usr/bin/app`;

            const result = ContentFileParser.parse(input);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('file');
        });
    });

    describe('edge cases', () => {
        it('should return empty array for empty input', () => {
            expect(ContentFileParser.parse('')).toEqual([]);
            expect(ContentFileParser.parse('   ')).toEqual([]);
        });

        it('should detect format based on content', () => {
            const yamlInput = '- src: ./app\n  dst: /usr/bin/app';
            const kvInput = 'src=./app dst=/usr/bin/app';

            const yamlResult = ContentFileParser.parse(yamlInput);
            const kvResult = ContentFileParser.parse(kvInput);

            expect(yamlResult).toHaveLength(1);
            expect(kvResult).toHaveLength(1);
            expect(yamlResult[0].src).toBe(kvResult[0].src);
            expect(yamlResult[0].dst).toBe(kvResult[0].dst);
            expect(yamlResult[0].type).toBe('file');
            expect(kvResult[0].type).toBe('file');
        });

        it('should handle mixed mode formats in YAML', () => {
            const yamlInput = `
- src: './app1'
  dst: '/usr/bin/app1'
  mode: 0755
- src: './app2'
  dst: '/usr/bin/app2'
  file_info:
    mode: 0644
    owner: 'app'
`;

            const result = ContentFileParser.parse(yamlInput.trim());

            expect(result).toHaveLength(2);
            expect(result[0].file_info?.mode).toBe('0755');
            expect(result[1].file_info?.mode).toBe('0644');
            expect(result[1].file_info?.owner).toBe('app');
        });
    });
});