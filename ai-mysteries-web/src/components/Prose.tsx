import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "../styles/prose.css";

interface ProseProps {
  children: string;
}

export default function Prose({ children }: ProseProps) {
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
