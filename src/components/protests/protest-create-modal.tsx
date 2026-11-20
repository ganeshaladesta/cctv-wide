"use client";

import React from "react";
import { ProtestEvent } from "@/lib/types/protests";
import { ProtestFormModal } from "./protest-form-modal";

interface ProtestCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newEvent: ProtestEvent) => void;
  currentUser?: { id?: string; name?: string; role?: string };
}

export function ProtestCreateModal({
  isOpen,
  onClose,
  onCreated,
  currentUser
}: ProtestCreateModalProps) {
  return (
    <ProtestFormModal
      isOpen={isOpen}
      onClose={onClose}
      mode="create"
      onSaved={onCreated}
      currentUser={currentUser}
    />
  );
}

export default ProtestCreateModal;
