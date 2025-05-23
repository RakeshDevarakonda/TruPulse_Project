import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import axios from "axios";
import { AlertCircle, Save, WifiOff } from "lucide-react";

// Import the Dexie database instance
import { db } from "../IndexedDb/Dixie.jsx"; // Assuming Dixie.jsx is in a sibling directory

const API_BASE_URL =
  "https://682f2262746f8ca4a47ffd31.mockapi.io/api/getnotes/notes";

const NotesContext = createContext();

export const useNotes = () => useContext(NotesContext);

export const NotesProvider = ({ children }) => {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Initialize isOnline based on navigator.onLine
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoSaveTimeout, setAutoSaveTimeout] = useState(null);
  const [selectedTab, setSelectedTab] = useState("write");

  // Effect to listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // When back online, attempt to sync pending operations
      syncPendingNotes();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Cleanup event listeners on component unmount
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []); // Empty dependency array means this runs once on mount

  // Handles changes to the selected note's content (title or content)
  const handleContentChange = (field, value) => {
    if (selectedNote) {
      const updates = { [field]: value };
      setSelectedNote((prev) => ({ ...prev, ...updates }));
      // Call updateNote to persist changes locally and potentially sync
      updateNote(selectedNote.id, updates);
    }
  };

  // Fetches notes from API if online, otherwise from IndexedDB
  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isOnline) {
        // Fetch from API when online
        const response = await axios.get(API_BASE_URL);
        const notesFromAPI = response.data;

        notesFromAPI.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        setNotes(notesFromAPI);
        // Set the first note as selected, or null if no notes
        setSelectedNote(notesFromAPI[0] || null);

        // Clear existing local notes and bulk add fresh notes from API
        await db.notes.clear();
        await db.notes.bulkAdd(notesFromAPI);
      } else {
        // Fetch from IndexedDB when offline
        const offlineNotes = await db.notes.toArray();
        setNotes(offlineNotes);
        setSelectedNote(offlineNotes[0] || null);
      }
    } catch (err) {
      setError("Failed to fetch notes. Displaying offline data.");
      console.error("Error fetching notes:", err);
      // Fallback to local IndexedDB notes on API fetch error
      const localNotes = await db.notes.toArray();
      setNotes(localNotes);
      setSelectedNote(localNotes[0] || null);
    } finally {
      setLoading(false);
    }
  }, [isOnline]); // Re-run when online status changes

  // Initial fetch of notes on component mount
  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Synchronizes a single note operation (create, update, delete) with the API
  const syncNote = async (note, action) => {
    // Set sync status to 'syncing' for visual feedback
    setSyncStatus((prev) => ({ ...prev, [note.id]: "syncing" }));
    try {
      let response;
      let apiNoteId = note.id; // Assume the note ID remains the same unless it's a new creation

      switch (action) {
        case "create":
          // POST request for new notes, API assigns the final ID
          response = await axios.post(API_BASE_URL, {
            title: note.title,
            content: note.content,
            updatedAt: note.updatedAt,
            synced: true, // Mark as synced on the API
          });
          apiNoteId = response.data.id; // Capture the API-assigned ID
          break;
        case "update":
          // PUT request to update an existing note
          response = await axios.put(`${API_BASE_URL}/${note.id}`, {
            id: note.id, // Ensure ID is sent in the body for some APIs
            title: note.title,
            content: note.content,
            updatedAt: note.updatedAt,
            synced: true,
          });
          break;
        case "delete":
          // DELETE request for a note
          response = await axios.delete(`${API_BASE_URL}/${note.id}`);
          break;
        default:
          throw new Error("Invalid sync action provided.");
      }

      // Check if the API request was successful
      if (response.status >= 200 && response.status < 300) {
        setSyncStatus((prev) => ({ ...prev, [note.id]: "synced" }));

        // If it was a 'create' operation, update the local IndexedDB and state with the API's new ID
        if (action === "create") {
          // Update the note in IndexedDB with the real API ID
          await db.notes.update(note.id, { id: apiNoteId, synced: true });
          // Update the notes state to reflect the new ID
          setNotes((prev) =>
            prev.map((n) =>
              n.id === note.id ? { ...n, id: apiNoteId, synced: true } : n
            )
          );
          // If the newly created note was selected, update its ID in selectedNote state
          if (selectedNote?.id === note.id) {
            setSelectedNote((prev) => ({
              ...prev,
              id: apiNoteId,
              synced: true,
            }));
          }
        } else if (action !== "delete") {
          // For update operations, just mark as synced in local state and DB
          setNotes((prev) =>
            prev.map((n) => (n.id === note.id ? { ...n, synced: true } : n))
          );
          await db.notes.update(note.id, { synced: true });
        }
        return { success: true, apiNoteId: apiNoteId }; // Return success and the API ID for 'create'
      } else {
        throw new Error(`API sync failed with status: ${response.status}`);
      }
    } catch (err) {
      setSyncStatus((prev) => ({ ...prev, [note.id]: "error" }));
      console.error(
        `Error syncing note (ID: ${note.id}, Action: ${action}):`,
        err
      );
      return { success: false, error: err }; // Return failure
    }
  };

  // Function to process and sync all pending operations from IndexedDB
  const syncPendingNotes = useCallback(async () => {
    if (!isOnline) {
      console.log("Not online, skipping pending sync.");
      return;
    }

    console.log("Attempting to sync pending notes...");
    // Get all pending operations, ordered by timestamp
    const pendingOperations = await db.pendingSync
      .orderBy("timestamp")
      .toArray();

    for (const operation of pendingOperations) {
      const { id: pendingOpId, noteId, action, data } = operation;
      console.log(`Processing pending operation: ${action} for note ${noteId}`);

      try {
        const result = await syncNote(data || { id: noteId }, action); // Pass data for create/update, or just ID for delete
        if (result.success) {
          // If a 'create' operation was successful, and the note's original ID was temporary (e.g., Date.now()),
          // ensure the local IndexedDB record is updated with the new API-assigned ID.
          if (
            action === "create" &&
            result.apiNoteId &&
            data.id !== result.apiNoteId
          ) {
            // Remove the old temporary note and add the new one with the API ID
            await db.notes.delete(data.id);
            const newNote = { ...data, id: result.apiNoteId, synced: true };
            await db.notes.add(newNote);

            // Update state for the newly created note's ID
            setNotes((prev) =>
              prev.map((n) => (n.id === data.id ? newNote : n))
            );
            if (selectedNote?.id === data.id) {
              setSelectedNote(newNote);
            }
          }
          // Remove the successfully synced operation from pendingSync
          await db.pendingSync.delete(pendingOpId);
          console.log(
            `Successfully synced and removed pending operation ${pendingOpId}`
          );
        } else {
          console.warn(
            `Failed to sync pending operation ${pendingOpId}. Will retry later.`
          );
          // If sync fails, keep it in pendingSync for next online attempt
        }
      } catch (err) {
        console.error(
          `Critical error during pending sync operation ${pendingOpId}:`,
          err
        );
        // Continue to next operation even if one fails critically
      }
    }
    // After attempting all pending syncs, re-fetch notes to ensure UI is consistent with backend
    fetchNotes();
  }, [isOnline, fetchNotes, selectedNote]); // Depend on isOnline and fetchNotes

  // Create a new note
  const createNote = async () => {
    const newNote = {
      // Use a temporary client-side ID (timestamp) for offline creation
      id: Date.now().toString(),
      title: "Add Title Here",
      content: "Add Content Here",
      updatedAt: new Date().toISOString(),
      synced: false, // Initially false, will be true after successful API sync
    };

    // Add to local IndexedDB immediately
    await db.notes.add(newNote);

    // Update React state
    setNotes((prev) => [newNote, ...prev]);
    setSelectedNote(newNote);

    if (isOnline) {
      // If online, attempt to sync immediately
      try {
        await syncNote(newNote, "create");
        // After successful creation and ID update, re-fetch notes to ensure consistency
        fetchNotes();
      } catch (err) {
        console.error("Error creating note online:", err);
        // If online sync fails, add to pending queue for retry
        await db.pendingSync.add({
          noteId: newNote.id,
          action: "create",
          data: newNote,
          timestamp: Date.now(),
        });
      }
    } else {
      // If offline, add to pending sync queue
      await db.pendingSync.add({
        noteId: newNote.id,
        action: "create",
        data: newNote,
        timestamp: Date.now(),
      });
      setSyncStatus((prev) => ({ ...prev, [newNote.id]: "pending" }));
    }
  };

  // Update an existing note
  const updateNote = async (noteId, updates) => {
    const updatedAt = new Date().toISOString();
    const currentNote = notes.find((n) => n.id === noteId);

    if (!currentNote) {
      console.warn(`Attempted to update non-existent note with ID: ${noteId}`);
      return;
    }

    const updatedNoteData = {
      ...currentNote,
      ...updates,
      updatedAt,
      synced: false,
    };

    // Update React state
    setNotes((prev) =>
      prev.map((note) => (note.id === noteId ? updatedNoteData : note))
    );

    // Update local IndexedDB
    await db.notes.update(noteId, { ...updates, updatedAt, synced: false });

    // Clear any existing auto-save timeout
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);

    // Set a new auto-save timeout
    const timeout = setTimeout(async () => {
      if (isOnline) {
        // Fetch the latest state of the note from local DB before syncing
        const noteToSync = await db.notes.get(noteId);
        if (noteToSync) {
          await syncNote(noteToSync, "update");
        }
      } else {
        // If offline, add to pending sync queue (or update existing pending update)
        // For simplicity, we'll just add a new one. A more robust solution might
        // debounce or merge pending updates for the same note.
        await db.pendingSync.add({
          noteId: noteId,
          action: "update",
          data: updatedNoteData, // Store the full updated data
          timestamp: Date.now(),
        });
        setSyncStatus((prev) => ({ ...prev, [noteId]: "pending" }));
      }
    }, 500); // Debounce for 500ms

    setAutoSaveTimeout(timeout);
  };

  // Delete a note
  const deleteNote = async (noteId) => {
    // Update React state
    setNotes((prev) => prev.filter((note) => note.id !== noteId));

    // Remove from local IndexedDB
    await db.notes.delete(noteId);

    // If the deleted note was selected, clear selectedNote
    if (selectedNote?.id === noteId) {
      setSelectedNote(null);
    }

    if (isOnline) {
      // If online, attempt to sync delete immediately
      await syncNote({ id: noteId }, "delete");
    } else {
      // If offline, add to pending sync queue
      await db.pendingSync.add({
        noteId: noteId,
        action: "delete",
        data: { id: noteId }, // Only need the ID for deletion
        timestamp: Date.now(),
      });
      setSyncStatus((prev) => ({ ...prev, [noteId]: "pending" }));
    }
  };

  // Filter notes based on search term
  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Determines and returns the appropriate sync status icon
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
    if (status === "pending")
      return (
        <AlertCircle className="w-4 h-4 text-orange-500" title="Pending Sync" />
      ); // New status for offline changes
    if (status === "synced" || note?.synced)
      return <Save className="w-4 h-4 text-green-500" />;

    // Default for notes that haven't been touched or are initially synced
    return <Save className="w-4 h-4 text-gray-400" />;
  };

  // Formats a date string for display
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

  // Provide context values to children components
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
