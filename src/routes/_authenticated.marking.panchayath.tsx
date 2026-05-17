import { createFileRoute, Link } from "@tanstack/react-router";
import { GraphCanvas } from "@/components/marking/GraphCanvas";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/marking/panchayath")({
  component: PanchayathMarking,
  head: () => ({ meta: [{ title: "Panchayath Marking" }] }),
});

function PanchayathMarking() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/marking"><ArrowLeft className="h-4 w-4" /> Back</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Panchayath Marking</h1>
      </div>
      <GraphCanvas
        cfg={{
          label: "Panchayath",
          nodesTable: "panchayaths",
          edgesTable: "panchayath_connections",
          srcCol: "source_panchayath_id",
          tgtCol: "target_panchayath_id",
          parentRef: { key: "district_id", label: "District", table: "districts" },
        }}
      />
    </main>
  );
}
