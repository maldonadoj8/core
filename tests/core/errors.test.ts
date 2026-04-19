import { describe, it, expect } from 'vitest';
import { SilasError, invariant } from '../../src/core/errors.js';

describe('SilasError', () => {
  it('is an instance of Error', () => {
    const err = new SilasError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of SilasError', () => {
    const err = new SilasError('test');
    expect(err).toBeInstanceOf(SilasError);
  });

  it('has name "SilasError"', () => {
    const err = new SilasError('test');
    expect(err.name).toBe('SilasError');
  });

  it('preserves the message', () => {
    const err = new SilasError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });
});

describe('invariant', () => {
  it('does not throw when condition is truthy', () => {
    expect(() => invariant(true, 'msg')).not.toThrow();
    expect(() => invariant(1, 'msg')).not.toThrow();
    expect(() => invariant('non-empty', 'msg')).not.toThrow();
    expect(() => invariant({}, 'msg')).not.toThrow();
  });

  it('throws SilasError when condition is falsy', () => {
    expect(() => invariant(false, 'fail')).toThrow(SilasError);
    expect(() => invariant(0, 'fail')).toThrow(SilasError);
    expect(() => invariant('', 'fail')).toThrow(SilasError);
    expect(() => invariant(null, 'fail')).toThrow(SilasError);
    expect(() => invariant(undefined, 'fail')).toThrow(SilasError);
  });

  it('includes the provided message', () => {
    expect(() => invariant(false, 'expected a number')).toThrow('expected a number');
  });
});
