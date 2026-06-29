import { useState, useCallback } from 'react';

export const useDetailInfoPanel = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggle = useCallback(() => setIsOpen(!isOpen), [isOpen]);
  const toggleCollapse = useCallback(
    () => setIsCollapsed(!isCollapsed),
    [isCollapsed]
  );

  return {
    isOpen,
    setIsOpen,
    toggle,
    isCollapsed,
    setIsCollapsed,
    toggleCollapse,
  };
};
