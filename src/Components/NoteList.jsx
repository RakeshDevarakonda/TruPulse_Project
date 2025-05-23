import React from "react";
import { useNotes } from "../context/NotesContext";
import { Plus, Search, Trash2, Wifi, WifiOff } from "lucide-react";

export default function NoteList() {
  const {
    selectedNote,
    setSelectedNote,
    searchTerm,
    setSearchTerm,
    isOnline,
    loading,
    error,
    createNote,
    deleteNote,
    filteredNotes,
    getSyncStatusIcon,
    formatDate,
  } = useNotes();
  return (
    <>
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-800">Notes</h1>
            <div className="flex items-center space-x-2">
              {isOnline ? (
                <Wifi className="w-5 h-5 text-green-500" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-500" />
              )}
              <button
                onClick={createNote}
                className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto">
          {/* {loading && (
            <div className="p-4 text-center text-gray-500">
              Loading notes...
            </div>
          )} */}

          {error && <div className="p-4 text-center text-red-500">{error}</div>}

          {filteredNotes.map((note) => (
            <div
              key={note.id}
              onClick={() => {
                setSelectedNote(note);
              }}
              className={`flex items-center justify-between p-3 cursor-pointer border-b border-gray-200
               ${
                 selectedNote?.id === note.id
                   ? "bg-blue-100"
                   : "hover:bg-gray-50"
               }`}
            >
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-gray-800 truncate">
                  {note.title.slice(0, 15)}
                </h2>
                <p className="text-xs text-gray-500 truncate">
                  {note.content.replace(/[\n\r]+/g, " ").slice(0, 40)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {formatDate(note.updatedAt)}
                </p>
              </div>
              <div className="flex items-center space-x-2 ml-2">
                {getSyncStatusIcon(note.id)}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNote(note);
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                  title="Edit"
                ></button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("Delete this note?")) {
                      deleteNote(note.id);
                    }
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}

          {!loading && filteredNotes.length === 0 && (
            <div className="p-4 text-center text-gray-400">No notes found</div>
          )}
        </div>
      </div>
    </>
  );
}
