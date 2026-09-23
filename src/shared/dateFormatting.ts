export function formatDateTime(date: string) {
  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function formatRelativeDate(date: string) {
  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "Date unavailable";
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const daysAgo = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (daysAgo === 0) {
    return "Today";
  }

  if (daysAgo === 1) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(value);
}
