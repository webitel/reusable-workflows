import { describe, it, expect, vi } from 'vitest';
import { ContentFileParser, ConfigGenerator } from './config';
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
    });
});