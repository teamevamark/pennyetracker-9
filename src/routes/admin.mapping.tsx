import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/mapping")({
  component: () => <Outlet />,
  head: () => ({ meta: [{ title: "Mapping — Admin" }] }),
});
