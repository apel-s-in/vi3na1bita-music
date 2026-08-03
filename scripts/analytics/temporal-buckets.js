const n = value =>
  Number.isFinite(Number(value))
    ? Number(value)
    : 0;

export const splitTemporalInterval = ({
  startedAt,
  endedAt,
  creditedMs,
  timezoneOffsetMin = new Date(
    n(startedAt) || Date.now()
  ).getTimezoneOffset()
} = {}) => {
  const start = Math.max(0, Math.floor(n(startedAt)));
  const end = Math.max(start, Math.floor(n(endedAt)));
  const credit = Math.max(0, Math.floor(n(creditedMs)));
  const offsetMs = n(timezoneOffsetMin) * 60000;

  if (!start || end <= start || credit <= 0) return [];

  const parts = [];
  let cursor = start;

  while (cursor < end) {
    const localCursor = cursor - offsetMs;
    const nextLocalHour =
      (Math.floor(localCursor / 3600000) + 1) *
      3600000;
    const boundary = Math.min(
      end,
      nextLocalHour + offsetMs
    );
    const date = new Date(localCursor);

    parts.push({
      hour: date.getUTCHours(),
      weekday: (date.getUTCDay() + 6) % 7,
      wallMs: boundary - cursor,
      creditedMs: 0
    });

    cursor = boundary;
  }

  const wallTotal = parts.reduce(
    (sum, part) => sum + part.wallMs,
    0
  );
  let allocated = 0;

  parts.forEach((part, index) => {
    part.creditedMs = index === parts.length - 1
      ? credit - allocated
      : Math.floor(
          credit * part.wallMs / wallTotal
        );

    allocated += part.creditedMs;
  });

  return parts.filter(part => part.creditedMs > 0);
};

export const temporalPartsFromListenEvent = event => {
  const data = event?.data || {};
  const segments = Array.isArray(data.creditedSegments)
    ? data.creditedSegments
    : [];

  if (segments.length) {
    return segments.flatMap(segment =>
      splitTemporalInterval({
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
        creditedMs: segment.creditedMs,
        timezoneOffsetMin: data.timezoneOffsetMin
      })
    );
  }

  const listenedMs = Math.max(
    0,
    Math.floor(n(data.listenedMs || n(data.listenedSeconds) * 1000))
  );
  const startedAt = Math.max(
    0,
    Math.floor(n(data.startedAt || event?.timestamp))
  );

  return splitTemporalInterval({
    startedAt,
    endedAt: startedAt + listenedMs,
    creditedMs: listenedMs,
    timezoneOffsetMin: data.timezoneOffsetMin
  });
};

export default {
  splitTemporalInterval,
  temporalPartsFromListenEvent
};
