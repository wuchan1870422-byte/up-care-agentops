import Workspace from "@/components/workspace";
export default function Page() {
  return (
    <Workspace
      browserDemo={
        Boolean(process.env.VERCEL) ||
        process.env.NEXT_PUBLIC_STORAGE_MODE === "browser"
      }
    />
  );
}
