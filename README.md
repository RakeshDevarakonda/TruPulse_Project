# Offline-First Markdown Notes App with Sync

A React-based Markdown notes application that works smoothly offline and syncs notes with a mock backend API when online. Notes are persisted locally in IndexedDB and support creating, editing, deleting, and searching — all with real-time sync status and connectivity awareness.

---

## 🚀 Project Overview

This app allows users to create and manage markdown notes that are fully functional offline. Changes are saved locally and synced automatically with a backend when the internet connection is restored, providing a seamless offline-first experience.

---

## 🎯 Features

- **Create & Edit Notes:** Add new notes with title and markdown content. Autosave edits with a debounce of 500ms.
- **Offline Persistence:** Notes stored in IndexedDB to allow full offline usage.
- **Syncing:** Sync new, updated, and deleted notes to a mock backend API once online.
- **Conflict Resolution:** Implements last-write-wins strategy for resolving sync conflicts.
- **Sync Status Indicators:** Shows sync status per note — Unsynced, Syncing, Synced, or Error.
- **Connectivity Awareness:** Detects online/offline status and updates UI accordingly.
- **Note Listing & Search:** List notes sorted by last updated time with a search bar filtering by title or content.
- **Responsive & Accessible UI:** Designed for accessibility and mobile responsiveness.

---

## 🧩 Data Model

```ts
interface Note {
  id: string;          // Unique UUID
  title: string;       // Note title
  content: string;     // Markdown content
  updatedAt: string;   // ISO timestamp of last update
  synced: boolean;     // Whether the note is synced with backend
}
