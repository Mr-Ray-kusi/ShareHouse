import { useEffect, useRef, useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';

const MAX_CACHED_ROUTES = 8;

export default function PersistentOutlet({ context }) {
  const outlet = useOutlet(context);
  const { pathname } = useLocation();
  const currentOutlet = useRef(outlet);
  const [cachedOutlets, setCachedOutlets] = useState([]);
  currentOutlet.current = outlet;

  useEffect(() => {
    setCachedOutlets((previous) => {
      const recent = previous.filter(([path]) => path !== pathname);
      return [...recent, [pathname, currentOutlet.current]].slice(-MAX_CACHED_ROUTES);
    });
  }, [pathname]);

  const outlets = new Map(cachedOutlets);
  outlets.set(pathname, outlet);

  return [...outlets].map(([path, element]) => (
    <div
      key={path}
      aria-hidden={path !== pathname}
      style={{ display: path === pathname ? 'contents' : 'none' }}
    >
      {element}
    </div>
  ));
}
