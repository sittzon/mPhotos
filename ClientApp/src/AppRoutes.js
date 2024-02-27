import LibraryMeta from "./components/LibraryMeta";
import Home from "./components/Home";
import VirtualHome from "./components/VirtualHome";

const AppRoutes = [
  {
    index: true,
    element: <Home />
  },
  {
    path: '/virtual',
    element: <VirtualHome />
  },
  {
    path: '/photo-meta',
    element: <LibraryMeta />
  }
];

export default AppRoutes;
