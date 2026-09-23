export function getWorkspaceLocation() {
  if (typeof window === "undefined") {
    return { isCreatingNew: false, transformationId: null };
  }

  const searchParams = new URLSearchParams(window.location.search);

  return {
    isCreatingNew: searchParams.get("view") === "new",
    transformationId: searchParams.get("project"),
  };
}

export function updateWorkspaceLocation(
  transformationId: string | null,
  isCreatingNew: boolean,
) {
  const url = new URL(window.location.href);

  if (transformationId) {
    url.searchParams.set("project", transformationId);
    url.searchParams.delete("view");
  } else if (isCreatingNew) {
    url.searchParams.set("view", "new");
    url.searchParams.delete("project");
  } else {
    url.searchParams.delete("project");
    url.searchParams.delete("view");
  }

  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}
