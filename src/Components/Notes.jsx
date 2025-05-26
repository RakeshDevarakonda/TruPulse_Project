import NoteList from "./NoteList";
import Editor from "./Editor";

const Notes = () => {
  return (
    <div className="flex h-screen bg-gray-100">
      <NoteList />
      <Editor />
    </div>
  );
};

export default Notes;
