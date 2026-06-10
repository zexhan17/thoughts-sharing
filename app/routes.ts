import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("thought/:id", "routes/thought.$id.tsx"),
  route("trash", "routes/trash.tsx"),
] satisfies RouteConfig;
