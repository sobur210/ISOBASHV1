import { ASSEMBLY_RESOLUTIONS } from '../../ai/video-assembly.types';
/**
 * Request body for `POST /media/assembly`.
 *
 * The caller supplies the *scenes*, not a prompt. There is no prompt here because
 * there is nothing to infer: a report or summary already has a title, headings and
 * paragraphs, and the feature's job is to lay that out and read it aloud.
 *
 * Every limit below is a plan limit from JSON2Video's free tier (600 credits,
 * 1080p, 60 seconds), not an invented one. The provider refuses an over-long movie
 * and a >2MB body anyway; failing here first means the user finds out before
 * waiting minutes for a render that was never going to succeed.
 */
/**
 * One scene. `@Matches` for a non-empty body instead of `@IsNotEmpty`, because a
 * scene of whitespace produces a provider error naming a field the user never
 * filled in, which is a worse message than a validation one.
 */
export declare class AssemblySceneDto {
    /** Rendered as the scene's heading line. */
    heading: string;
    /** Narration and on-screen text. JSON2Video charges TTS 0 credits, so this is free to read aloud. */
    body: string;
}
export declare class CreateAssemblyDto {
    title: string;
    subtitle?: string;
    /**
     * Capped at 40 because a single movie cannot exceed 60 seconds and each scene
     * costs at least a few seconds to read. Past this the total is refused on
     * duration, not on a magic number here.
     */
    scenes: AssemblySceneDto[];
    /**
     * Narration on/off. Uses `StrictBoolean` so `"false"` cannot become `true`:
     * a summary that silently gains a voice is a wrong result, not a cosmetic one.
     */
    voiceover?: boolean | string;
    /** Appended as a closing scene, e.g. a source line or a call to action. */
    outro?: string;
    /** Must be one of the plan's sizes; `full-hd` is the free ceiling. */
    resolution: (typeof ASSEMBLY_RESOLUTIONS)[number];
    /**
     * Where the content came from, recorded on the asset so an assembled video can
     * be traced back to the report or summary it was built from.
     */
    source: 'research' | 'chat';
    /** Id of the report or conversation, when there is one. */
    sourceId?: string;
    projectId?: number;
}
