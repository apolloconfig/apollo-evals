import { describe, expect, it } from 'vitest';
import { ARTIFACT_CONFIG } from '../apollo-evals.config.js';
import { apolloJavaJarRelativePath, apolloJavaJarUrl, cliArchiveName, cliArchiveUrl, currentCliTarget } from '../src/core/artifacts.js';

describe('remote artifact coordinates', () => {
  it('maps supported Apollo CLI release targets', () => {
    expect(currentCliTarget('darwin', 'arm64')).toBe('aarch64-apple-darwin');
    expect(currentCliTarget('linux', 'x64')).toBe('x86_64-unknown-linux-gnu');
    expect(currentCliTarget('win32', 'x64')).toBe('x86_64-pc-windows-msvc');
    expect(() => currentCliTarget('linux', 'ppc64')).toThrow(/no release asset/);
  });

  it('builds versioned GitHub release URLs from the central config', () => {
    const target = 'aarch64-apple-darwin';
    expect(cliArchiveName(target)).toBe(`apollo-v${ARTIFACT_CONFIG.apolloCli.version}-${target}.tar.gz`);
    expect(cliArchiveUrl(target)).toContain(`/releases/download/v${ARTIFACT_CONFIG.apolloCli.version}/`);
    expect(apolloJavaJarRelativePath()).toBe(`com/ctrip/framework/apollo/apollo-client/${ARTIFACT_CONFIG.apolloJava.version}/apollo-client-${ARTIFACT_CONFIG.apolloJava.version}.jar`);
    expect(apolloJavaJarUrl()).toBe(`https://repo.maven.apache.org/maven2/${apolloJavaJarRelativePath()}`);
  });
});
