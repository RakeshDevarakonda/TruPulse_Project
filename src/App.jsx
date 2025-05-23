import React from "react";
import { NotesProvider } from "./context/NotesContext";
import Notes from "./Components/Notes";

export default function App() {
  return (
    <>
      <NotesProvider>
        <Notes />
      </NotesProvider>
    </>
  );
}
