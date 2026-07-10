import { normaliseTemporaryDurationMinutes } from "./durations.js";
import { updateState } from "./storage.js";

const MILLISECONDS_PER_MINUTE = 60_000;
export const GLOBAL_DISABLE_EXPIRY_ALARM_PREFIX =
  "social-media-blocker-global-disable-expiry:";

export async function pauseBlocking(
  durationMinutesValue: number,
): Promise<void> {
  const durationMinutes =
    normaliseTemporaryDurationMinutes(durationMinutesValue);
  if (!durationMinutes) {
    throw new Error("Choose a valid disable duration.");
  }

  const globalDisabledUntil =
    Date.now() + durationMinutes * MILLISECONDS_PER_MINUTE;

  let previousGlobalDisabledUntil: number | null = null;
  await updateState((state) => {
    previousGlobalDisabledUntil = state.globalDisabledUntil;
    return {
      ...state,
      globalDisabledUntil,
    };
  });

  try {
    await scheduleGlobalDisableExpiry(globalDisabledUntil);
  } catch (error) {
    await updateState((state) =>
      state.globalDisabledUntil === globalDisabledUntil
        ? {
            ...state,
            globalDisabledUntil: previousGlobalDisabledUntil,
          }
        : state,
    );
    throw error;
  }
}

export async function scheduleGlobalDisableExpiry(
  globalDisabledUntil: number,
): Promise<void> {
  // Unique names prevent concurrent pause requests from overwriting the winning timer.
  await chrome.alarms.create(
    `${GLOBAL_DISABLE_EXPIRY_ALARM_PREFIX}${globalDisabledUntil}`,
    {
      when: globalDisabledUntil,
    },
  );
}
