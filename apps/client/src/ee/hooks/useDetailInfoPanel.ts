import { useState, useCallback } from 'react';

export const useDetailInfoPanel = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const toggleCollapse = useCallback(() => setIsCollapsed((v) => !v), []);

  return {
    isOpen,
    setIsOpen,
    toggle,
    isCollapsed,
    setIsCollapsed,
    toggleCollapse,
  };
};
