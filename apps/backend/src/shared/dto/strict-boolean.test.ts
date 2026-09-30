import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { strictBooleanValue } from './strict-boolean.decorator';
import { CreateImageGenerationDto, CreateVideoGenerationDto } from '../../media/dto/media.dto';
import { CreateAgentDto, UpdateAgentDto } from '../../agents/dto/agent.dto';

/**
 * The global pipe runs with `enableImplicitConversion`, which coerces a value to
 * its declared type before `@IsBoolean()` sees it. These tests pin the behaviour
 * that prevents that from turning a refusal into a silent `true`.
 */
describe('boolean validation under the global pipe', () => {
  const opts = { enableImplicitConversion: true, exposeDefaultValues: true };

  const accepted = async (cls: new () => object, input: Record<string, unknown>) => {
    const errors = await validate(plainToInstance(cls, input, opts) as object);
    return errors.length === 0;
  };

  describe('CreateVideoGenerationDto.audio', () => {
    it.each([
      ['a real true', true],
      ['a real false', false],
      ['the string "true"', 'true'],
      ['the string "false"', 'false'],
      ['an upper-case "TRUE"', 'TRUE'],
      ['a padded " true "', ' true '],
    ])('accepts %s', async (_label, value) => {
      expect(await accepted(CreateVideoGenerationDto, { prompt: 'a clip', audio: value })).toBe(true);
    });

    it.each([
      ['the string "yes"', 'yes'],
      ['the string "no"', 'no'],
      ['the number 1', 1],
      ['the number 0', 0],
      ['an object', {}],
      ['an array', []],
    ])('refuses %s instead of coercing it', async (_label, value) => {
      expect(await accepted(CreateVideoGenerationDto, { prompt: 'a clip', audio: value })).toBe(false);
    });

    it('treats an absent flag as absent rather than false', async () => {
      const errors = await validate(plainToInstance(CreateVideoGenerationDto, { prompt: 'a clip' }, opts) as object);
      expect(errors).toHaveLength(0);
    });
  });

  describe('CreateImageGenerationDto.enhance', () => {
    it('accepts a real boolean and the two form strings', async () => {
      expect(await accepted(CreateImageGenerationDto, { prompt: 'x', enhance: true })).toBe(true);
      expect(await accepted(CreateImageGenerationDto, { prompt: 'x', enhance: false })).toBe(true);
      expect(await accepted(CreateImageGenerationDto, { prompt: 'x', enhance: 'false' })).toBe(true);
    });

    it('refuses a non-boolean instead of treating it as enabled', async () => {
      // The bug this pins: implicit conversion used to turn "no" into `true`, so a
      // client asking not to enhance got enhancement anyway.
      expect(await accepted(CreateImageGenerationDto, { prompt: 'x', enhance: 'no' })).toBe(false);
      expect(await accepted(CreateImageGenerationDto, { prompt: 'x', enhance: 'false please' })).toBe(false);
      expect(await accepted(CreateImageGenerationDto, { prompt: 'x', enhance: 1 })).toBe(false);
    });
  });

  describe('agent memoryEnabled', () => {
    it.each([
      [CreateAgentDto, 'create'],
      [UpdateAgentDto, 'update'],
    ])('refuses a non-boolean on %s', async (cls) => {
      const input = cls === CreateAgentDto
        ? { name: 'a', instructions: 'b', memoryEnabled: 'no' }
        : { memoryEnabled: 'no' };
      expect(await accepted(cls, input as Record<string, unknown>)).toBe(false);
    });

    it('accepts a real boolean and the string "false"', async () => {
      expect(await accepted(UpdateAgentDto, { memoryEnabled: false })).toBe(true);
      expect(await accepted(UpdateAgentDto, { memoryEnabled: 'false' })).toBe(true);
    });
  });

  describe('strictBooleanValue', () => {
    it('narrows the two legitimate strings and real booleans', () => {
      expect(strictBooleanValue(true)).toBe(true);
      expect(strictBooleanValue(false)).toBe(false);
      expect(strictBooleanValue('true')).toBe(true);
      expect(strictBooleanValue('false')).toBe(false);
      expect(strictBooleanValue('  FALSE ')).toBe(false);
    });

    it('never returns a truthy value for anything else', () => {
      for (const value of ['no', 'yes', '', '1', 0, 1, {}, [], null, undefined, NaN]) {
        expect(strictBooleanValue(value)).toBeUndefined();
      }
    });
  });
});
