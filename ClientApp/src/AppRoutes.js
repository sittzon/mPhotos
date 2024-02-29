import LibraryMeta from "./components/LibraryMeta";
import Home from "./components/Home";
import VirtualHome from "./components/VirtualHome";
import TestMLightbox from "./components/TestMLightbox";

const AppRoutes = [
  {
    index: true,
    element: <Home />
  },
  {
    path: '/mlight',
    element: <TestMLightbox />
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
