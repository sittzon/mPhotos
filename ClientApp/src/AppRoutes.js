import LibraryMeta from "./components/LibraryMeta";
import Home from "./components/Home";

const AppRoutes = [
  {
    index: true,
    element: <Home />
  },
  {
    path: '/photo-meta',
    element: <LibraryMeta />
  }
];

export default AppRoutes;
