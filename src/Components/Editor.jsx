import React from "react";
import { useNotes } from "../context/NotesContext";

import ReactMde from "react-mde";
import "react-mde/lib/styles/css/react-mde-all.css";

import * as Showdown from "showdown";
import "react-mde/lib/styles/css/react-mde-all.css";
const converter = new Showdown.Converter({
  tables: true,
  simplifiedAutoLink: true,
  strikethrough: true,
  tasklists: true,
});

export default function Editor() {
  const {
    selectedNote,
    setSelectedTab,
    selectedTab,
    handleContentChange,
    formatDate,
  } = useNotes();
  return (
    <>
      <div className="flex-1 flex flex-col bg-white">
        {selectedNote ? (
          <>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <input
                type="text"
                value={selectedNote.title}
                onChange={(e) => handleContentChange("title", e.target.value)}
                className="text-2xl font-bold w-full border-b border-blue-500 focus:outline-none"
                placeholder="Note Title"
                autoFocus
              />
              <div className="text-sm text-gray-500 ml-4 whitespace-nowrap">
                Updated: {formatDate(selectedNote.updatedAt)}
              </div>
            </div>

            <ReactMde
              value={selectedNote.content}
              onChange={(value) => handleContentChange("content", value)}
              generateMarkdownPreview={(markdown) =>
                Promise.resolve(converter.makeHtml(markdown))
              }
              minEditorHeight={300}
              selectedTab={selectedTab}
              onTabChange={setSelectedTab}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 select-none">
            Select or create a note to get started
          </div>
        )}
      </div>
    </>
  );
}
