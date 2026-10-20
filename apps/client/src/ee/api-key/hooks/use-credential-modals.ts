import { useState } from "react";

export function useCredentialModals<T>() {
  const [createOpened, setCreateOpened] = useState(false);
  const [created, setCreated] = useState<T | null>(null);
  const [updateOpened, setUpdateOpened] = useState(false);
  const [revokeOpened, setRevokeOpened] = useState(false);
  const [selected, setSelected] = useState<T | null>(null);

  const openUpdate = (item: T) => {
    setSelected(item);
    setUpdateOpened(true);
  };
  const openRevoke = (item: T) => {
    setSelected(item);
    setRevokeOpened(true);
  };
  const closeUpdate = () => {
    setUpdateOpened(false);
    setSelected(null);
  };
  const closeRevoke = () => {
    setRevokeOpened(false);
    setSelected(null);
  };

  return {
    createOpened,
    openCreate: () => setCreateOpened(true),
    closeCreate: () => setCreateOpened(false),
    created,
    setCreated,
    updateOpened,
    openUpdate,
    closeUpdate,
    revokeOpened,
    openRevoke,
    closeRevoke,
    selected,
  };
}
