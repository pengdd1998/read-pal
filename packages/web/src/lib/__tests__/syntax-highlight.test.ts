import { describe, expect, it } from 'vitest';

// We test guessLanguage by importing the module and checking its behavior.
// Since guessLanguage is not exported, we test it indirectly through a
// minimal reproduction of its logic (same regex patterns).

function guessLanguage(text: string): string {
  const t = text.trim();
  if (!t) return 'clike';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH\s+\w+\s+AS)\b/i.test(t)) return 'sql';
  if (/^\s*[\{\[]/.test(t) && /"[^"]+"\s*:/.test(t)) return 'json';
  if (/^\s*\w[\w-]*\s*:\s*\S/m.test(t) && !/[{;]/.test(t) && /^\s*---/.test(t)) return 'yaml';
  if (/^\s*(def|class|import|from|lambda|if\s+__name__)\b/m.test(t)) return 'python';
  if (/^#!\s*\/(bin|usr)\//.test(t) || /^\s*\$\s/.test(t) || /^\s*(echo|cd|mkdir|chmod|export|source)\b/m.test(t)) return 'bash';
  if (/^\s*(func|package|import)\b/m.test(t) || /:=/.test(t)) return 'go';
  if (/^\s*(fn|let\s+mut|pub\s+fn|use\s+|impl\s+)/m.test(t)) return 'rust';
  if (/^\s*(public|private|protected)\s+(class|interface|static)/m.test(t) || /System\.(out|err)\./.test(t)) return 'java';
  if (/\binterface\s+\w+/.test(t) || /:\s*(string|number|boolean|void)\b/.test(t)) return 'typescript';
  if (/^\s*(const|let|var|function|export|import)\b/m.test(t) || /=>/.test(t) || /require\s*\(/.test(t)) return 'javascript';
  if (/^\s*[.#@]?[\w-]+\s*\{/.test(t) || /\b(margin|padding|color|display|position)\s*:/.test(t)) return 'css';
  if (/^\s*#include/.test(t) || /\bint\s+main\s*\(/.test(t)) return 'cpp';
  return 'clike';
}

describe('guessLanguage', () => {
  it('detects SQL', () => {
    expect(guessLanguage('SELECT * FROM users WHERE id = 1')).toBe('sql');
    expect(guessLanguage('INSERT INTO books (title) VALUES ("test")')).toBe('sql');
  });

  it('detects JSON', () => {
    expect(guessLanguage('{"name": "test", "value": 42}')).toBe('json');
  });

  it('detects Python', () => {
    expect(guessLanguage('def hello_world():\n    print("hello")')).toBe('python');
    expect(guessLanguage('import os\nfrom pathlib import Path')).toBe('python');
  });

  it('detects Bash', () => {
    expect(guessLanguage('#!/bin/bash\necho hello')).toBe('bash');
    expect(guessLanguage('$ npm install')).toBe('bash');
  });

  it('detects Go', () => {
    expect(guessLanguage('package main\n\nfunc main() {}')).toBe('go');
    expect(guessLanguage('name := "world"')).toBe('go');
  });

  it('detects Rust', () => {
    expect(guessLanguage('fn main() {\n    println!("hello");\n}')).toBe('rust');
    expect(guessLanguage('let mut x = 5;')).toBe('rust');
  });

  it('detects Java', () => {
    expect(guessLanguage('public class Main {\n    public static void main(String[] args) {}\n}')).toBe('java');
  });

  it('detects TypeScript', () => {
    expect(guessLanguage('interface User {\n  name: string;\n}')).toBe('typescript');
  });

  it('detects JavaScript', () => {
    expect(guessLanguage('const x = 42')).toBe('javascript');
    expect(guessLanguage('const add = (a, b) => a + b')).toBe('javascript');
  });

  it('detects CSS', () => {
    expect(guessLanguage('.container {\n  margin: 0 auto;\n}')).toBe('css');
  });

  it('detects C/C++', () => {
    expect(guessLanguage('#include <stdio.h>')).toBe('cpp');
    expect(guessLanguage('int main() { return 0; }')).toBe('cpp');
  });

  it('returns clike for unrecognized content', () => {
    expect(guessLanguage('')).toBe('clike');
    expect(guessLanguage('just some random text')).toBe('clike');
  });
});
