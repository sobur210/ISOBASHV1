"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const globals_1 = require("@jest/globals");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const strict_boolean_decorator_1 = require("./strict-boolean.decorator");
const media_dto_1 = require("../../media/dto/media.dto");
const agent_dto_1 = require("../../agents/dto/agent.dto");
/**
 * The global pipe runs with `enableImplicitConversion`, which coerces a value to
 * its declared type before `@IsBoolean()` sees it. These tests pin the behaviour
 * that prevents that from turning a refusal into a silent `true`.
 */
(0, globals_1.describe)('boolean validation under the global pipe', () => {
    const opts = { enableImplicitConversion: true, exposeDefaultValues: true };
    const accepted = async (cls, input) => {
        const errors = await (0, class_validator_1.validate)((0, class_transformer_1.plainToInstance)(cls, input, opts));
        return errors.length === 0;
    };
    (0, globals_1.describe)('CreateVideoGenerationDto.audio', () => {
        globals_1.it.each([
            ['a real true', true],
            ['a real false', false],
            ['the string "true"', 'true'],
            ['the string "false"', 'false'],
            ['an upper-case "TRUE"', 'TRUE'],
            ['a padded " true "', ' true '],
        ])('accepts %s', async (_label, value) => {
            (0, globals_1.expect)(await accepted(media_dto_1.CreateVideoGenerationDto, { prompt: 'a clip', audio: value })).toBe(true);
        });
        globals_1.it.each([
            ['the string "yes"', 'yes'],
            ['the string "no"', 'no'],
            ['the number 1', 1],
            ['the number 0', 0],
            ['an object', {}],
            ['an array', []],
        ])('refuses %s instead of coercing it', async (_label, value) => {
            (0, globals_1.expect)(await accepted(media_dto_1.CreateVideoGenerationDto, { prompt: 'a clip', audio: value })).toBe(false);
        });
        (0, globals_1.it)('treats an absent flag as absent rather than false', async () => {
            const errors = await (0, class_validator_1.validate)((0, class_transformer_1.plainToInstance)(media_dto_1.CreateVideoGenerationDto, { prompt: 'a clip' }, opts));
            (0, globals_1.expect)(errors).toHaveLength(0);
        });
    });
    (0, globals_1.describe)('CreateImageGenerationDto.enhance', () => {
        (0, globals_1.it)('accepts a real boolean and the two form strings', async () => {
            (0, globals_1.expect)(await accepted(media_dto_1.CreateImageGenerationDto, { prompt: 'x', enhance: true })).toBe(true);
            (0, globals_1.expect)(await accepted(media_dto_1.CreateImageGenerationDto, { prompt: 'x', enhance: false })).toBe(true);
            (0, globals_1.expect)(await accepted(media_dto_1.CreateImageGenerationDto, { prompt: 'x', enhance: 'false' })).toBe(true);
        });
        (0, globals_1.it)('refuses a non-boolean instead of treating it as enabled', async () => {
            // The bug this pins: implicit conversion used to turn "no" into `true`, so a
            // client asking not to enhance got enhancement anyway.
            (0, globals_1.expect)(await accepted(media_dto_1.CreateImageGenerationDto, { prompt: 'x', enhance: 'no' })).toBe(false);
            (0, globals_1.expect)(await accepted(media_dto_1.CreateImageGenerationDto, { prompt: 'x', enhance: 'false please' })).toBe(false);
            (0, globals_1.expect)(await accepted(media_dto_1.CreateImageGenerationDto, { prompt: 'x', enhance: 1 })).toBe(false);
        });
    });
    (0, globals_1.describe)('agent memoryEnabled', () => {
        globals_1.it.each([
            [agent_dto_1.CreateAgentDto, 'create'],
            [agent_dto_1.UpdateAgentDto, 'update'],
        ])('refuses a non-boolean on %s', async (cls) => {
            const input = cls === agent_dto_1.CreateAgentDto
                ? { name: 'a', instructions: 'b', memoryEnabled: 'no' }
                : { memoryEnabled: 'no' };
            (0, globals_1.expect)(await accepted(cls, input)).toBe(false);
        });
        (0, globals_1.it)('accepts a real boolean and the string "false"', async () => {
            (0, globals_1.expect)(await accepted(agent_dto_1.UpdateAgentDto, { memoryEnabled: false })).toBe(true);
            (0, globals_1.expect)(await accepted(agent_dto_1.UpdateAgentDto, { memoryEnabled: 'false' })).toBe(true);
        });
    });
    (0, globals_1.describe)('strictBooleanValue', () => {
        (0, globals_1.it)('narrows the two legitimate strings and real booleans', () => {
            (0, globals_1.expect)((0, strict_boolean_decorator_1.strictBooleanValue)(true)).toBe(true);
            (0, globals_1.expect)((0, strict_boolean_decorator_1.strictBooleanValue)(false)).toBe(false);
            (0, globals_1.expect)((0, strict_boolean_decorator_1.strictBooleanValue)('true')).toBe(true);
            (0, globals_1.expect)((0, strict_boolean_decorator_1.strictBooleanValue)('false')).toBe(false);
            (0, globals_1.expect)((0, strict_boolean_decorator_1.strictBooleanValue)('  FALSE ')).toBe(false);
        });
        (0, globals_1.it)('never returns a truthy value for anything else', () => {
            for (const value of ['no', 'yes', '', '1', 0, 1, {}, [], null, undefined, NaN]) {
                (0, globals_1.expect)((0, strict_boolean_decorator_1.strictBooleanValue)(value)).toBeUndefined();
            }
        });
    });
});
//# sourceMappingURL=strict-boolean.test.js.map