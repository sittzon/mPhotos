import { Counter } from "./components/Counter";
import { FetchData } from "./components/FetchData";
import { Home } from "./components/Home";
import { LibraryMeta } from "./components/LibraryMeta";

const AppRoutes = [
  {
    index: true,
    element: <Home />
  },
  {
    path: '/counter',
    element: <Counter />
  },
  {
    path: '/photo-meta',
    element: <FetchData />
  },
  {
    path: '/lib-meta',
    element: <LibraryMeta />
  }
];

export default AppRoutes;
