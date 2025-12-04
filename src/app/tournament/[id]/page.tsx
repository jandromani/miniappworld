export default function TournamentRegisteredPage({ params }: { params: { id: string } }) {
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Inscripción confirmada</h1>
      <p>Te has inscrito correctamente en el torneo {params.id}. Prepara tu mejor estrategia.</p>
    </main>
  );
}
