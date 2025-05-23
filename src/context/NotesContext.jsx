import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import axios from "axios";
import { AlertCircle, Save, WifiOff } from "lucide-react";

import { db } from "../IndexedDb/Dixie.jsx";

const API_BASE_URL =
  "https://682f2262746f8ca4a47ffd31.mockapi.io/api/getnotes/notes";

const NotesContext = createContext();

export const useNotes = () => useContext(NotesContext);

export const NotesProvider = ({ children }) => {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoSaveTimeout, setAutoSaveTimeout] = useState(null);
  const [selectedTab, setSelectedTab] = useState("write");

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingNotes();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleContentChange = (field, value) => {
    if (selectedNote) {
      const updates = { [field]: value };
      setSelectedNote((prev) => ({ ...prev, ...updates }));
      updateNote(selectedNote.id, updates);
    }
  };

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let notesData = [];

      if (isOnline) {
        // Fetch from API when online
        const response = await axios.get(API_BASE_URL);
        notesData = response.data;

        // Sort notes by updatedAt (newest first)
        notesData.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        setNotes(notesData);
        setSelectedNote(notesData[0] || null);

        // Clear existing local notes and bulk add fresh notes from API
        await db.notes.clear();
        await db.pendingSync.clear();
        await db.notes.bulkPut(notesData);
      } else {
        // Fetch from IndexedDB when offline
        notesData = await db.notes.toArray();

        // Sort notes by updatedAt (newest first)
        notesData.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        setNotes(notesData);
        setSelectedNote(notesData[0] || null);
      }
    } catch (err) {
      setError("Failed to fetch notes. Displaying offline data.");
      console.error("Error fetching notes:", err);

      // Fallback to local IndexedDB notes on API fetch error
      const localNotes = await db.notes.toArray();

      // Sort notes by updatedAt (newest first)
      localNotes.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      setNotes(localNotes);
      setSelectedNote(localNotes[0] || null);
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const syncPendingNotes = useCallback(async () => {
    const pendingOperations = await db.pendingSync.toArray();

    console.log(pendingOperations);

    for (const operation of pendingOperations) {
      const { id: pendingOpId, noteId, action, data } = operation;
      console.log(`Processing pending operation: ${action} for note ${noteId}`);

      try {
        await syncNote(data, action);

        await db.pendingSync.delete(pendingOpId);
      } catch (err) {
        console.error(
          `Failed to sync pending operation for note ${noteId}:`,
          err
        );
        // Do not delete the pending operation so it can retry later
      }
    }
  }, [isOnline, fetchNotes]);

  const syncNote = async (note, action) => {
    console.log(note, action);
    setSyncStatus((prev) => ({ ...prev, [note.id]: "syncing" }));
    try {
      let response;
      switch (action) {
        case "create":
          response = await axios.post(API_BASE_URL, {
            title: note.title,
            content: note.content,
            updatedAt: note.updatedAt,
            synced: note.synced,
          });
          break;
        case "update":
          response = await axios.put(`${API_BASE_URL}/${note.id}`, {
            id: note.id,
            title: note.title,
            content: note.content,
            updatedAt: note.updatedAt,
            synced: note.synced,
          });
          break;
        case "delete":
          response = await axios.delete(`${API_BASE_URL}/${note.id}`);
          break;
        default:
          throw new Error("Invalid action");
      }
      if (response.status >= 200 && response.status < 300) {
        setSyncStatus((prev) => ({ ...prev, [note.id]: "synced" }));

        if (action !== "delete") {
          setNotes((prev) =>
            prev.map((n) => (n.id === note.id ? { ...n, synced: true } : n))
          );
        }
        fetchNotes();
      } else {
        throw new Error("Sync failed");
      }
    } catch (err) {
      setSyncStatus((prev) => ({ ...prev, [note.id]: "error" }));
      console.error("Sync error:", err);
    }
  };

  const createNote = async () => {
    const newNote = {
      id: `temp_${Date.now()}`,
      title: "Add Title Here",
      content: "Add Content Here",
      updatedAt: new Date().toISOString(),
      synced: false,
    };
    setNotes((prev) => [newNote, ...prev]);
    setSelectedNote(newNote);

    await db.notes.add(newNote);

    if (isOnline) {
      try {
        await syncNote(newNote, "create");
        await fetchNotes();
      } catch (err) {
        console.error(err);
      }
    } else {
      await db.pendingSync.add({
        id: newNote.id,
        action: "create",
        data: newNote,
        timestamp: Date.now(),
      });
    }

    const pendingNotes = await db.pendingSync.toArray();
    console.table(pendingNotes);
  };

  const updateNote = async (noteId, updates) => {
    const updatedNote = {
      ...notes.find((note) => note.id === noteId), // get existing note from current state
      ...updates,
      updatedAt: new Date().toISOString(),
      synced: false,
    };
    setNotes((prev) =>
      prev.map((note) =>
        note.id === noteId
          ? {
              ...note,
              ...updates,
              updatedAt: new Date().toISOString(),
              synced: false,
            }
          : note
      )
    );

    await db.notes.update(noteId, {
      ...updates,
      updatedAt: new Date().toISOString(),
      synced: false,
    });

    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);

    if (isOnline) {
      const timeout = setTimeout(async () => {
        if (!updatedNote) return;

        await syncNote({ ...updatedNote, ...updates }, "update");
      }, 500);

      setAutoSaveTimeout(timeout);
    } else {
      const action = updatedNote.id.startsWith("temp") ? "create" : "update";

      const existingPending = await db.pendingSync.get({
        id: updatedNote.id,
      });

      if (existingPending) {
        // Update existing pending sync
        await db.pendingSync.update(existingPending.id, {
          action,
          data: updatedNote,
          timestamp: Date.now(),
        });
      } else {
        // Add new pending sync
        await db.pendingSync.add({
          id: updatedNote.id,
          action,
          data: updatedNote,
          timestamp: Date.now(),
        });
      }

      const pendingNotes = await db.pendingSync.toArray();
      console.table(pendingNotes);

      setSyncStatus((prev) => ({
        ...prev,
        [updatedNote.id]: "pending",
      }));
    }
  };

  const deleteNote = async (noteId) => {
    setNotes((prev) => prev.filter((note) => note.id !== noteId));
    if (selectedNote?.id === noteId) {
      setSelectedNote(null);
    }

    await db.notes.delete(noteId);

    if (isOnline) {
      await syncNote({ id: noteId }, "delete");
    } else {
      await db.pendingSync.add({
        id: noteId,
        action: "delete",
        data: { id: noteId }, // Only need the ID for deletion
        timestamp: Date.now(),
      });
      setSyncStatus((prev) => ({ ...prev, [noteId]: "pending" }));
    }

    const pendingNotes = await db.pendingSync.toArray();
    console.table(pendingNotes);
  };

  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSyncStatusIcon = (noteId) => {
    const status = syncStatus[noteId];
    const note = notes.find((n) => n.id === noteId);

    if (!isOnline) return <WifiOff className="w-4 h-4 text-gray-400" />;
    if (status === "syncing")
      return (
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      );
    if (status === "error")
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (status === "synced" || note?.synced)
      return <Save className="w-4 h-4 text-green-500" />;
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Invalid date";
    }
  };

  return (
    <NotesContext.Provider
      value={{
        formatDate,
        getSyncStatusIcon,
        notes,
        selectedNote,
        setSelectedNote,
        searchTerm,
        setSearchTerm,
        isOnline,
        syncStatus,
        loading,
        error,
        createNote,
        updateNote,
        deleteNote,
        filteredNotes,
        setSelectedTab,
        selectedTab,
        handleContentChange,
      }}
    >
      {children}
    </NotesContext.Provider>
  );
};
