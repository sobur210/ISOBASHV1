import type { StartVideoGeneration } from './video-generation.service';

/**
 * The BullMQ job name every video render is enqueued under.
 *
 * Kept in its own leaf file (with no value imports) so both the producer
 * (`video-generation.service`) and the worker (`video-render.queue`) can agree on
 * one name without importing each other: the whole queue wiring only works because
 * Nest can describe `VideoRenderQueue` before `VideoGenerationService` finished
 * loading, and a value import in the wrong direction would break that.
 */
export const VIDEO_RENDER_JOB = 'video-render';

/**
 * Renders are queued per renderer, never on the shared `isobash-queue`.
 *
 * The shared queue is a catch-all: the `apps/worker` process consumes it and the
 * queue's own job counts feed the admin health panel. A render is not that kind of
 * job, and putting one there is not a slower render, it is a lost one:
 *
 *  - the worker process has no renderer and no database. It acks whatever it
 *    receives, so a render picked up there is never run and the row sits PENDING
 *    for ever, which the user sees as a spinner that never resolves;
 *  - any other API replica on the same Redis will also take the job, and a replica
 *    without the renderer's credentials fails the run it was handed, so whether a
 *    render succeeds would depend on which process happened to win the race.
 *
 * So a render is only ever offered to processes that actually have that renderer
 * registered, and a process that cannot serve it never competes for the job. That is
 * also what lets a deployment split the work: a fleet where only some replicas hold
 * the key still renders, because the ones without it are not consumers.
 *
 * The separator is a dot because BullMQ refuses a queue name containing a colon.
 */
export const VIDEO_RENDER_QUEUE_PREFIX = 'isobash-video-render.';

export function videoRenderQueueName(provider: string): string {
  return `${VIDEO_RENDER_QUEUE_PREFIX}${provider}`;
}

/**
 * A video render as it crosses the queue.
 *
 * This is the complete description of the work, because the worker that picks the
 * job up may be a *different process* than the one that accepted the request. The
 * queue is the memory here, not the API process.
 */
export type VideoRenderJobData = {
  videoGenerationId: string;
  userId: number;
  input: StartVideoGeneration;
  submittedAt: string;
};