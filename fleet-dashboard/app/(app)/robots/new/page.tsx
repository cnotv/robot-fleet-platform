'use client';

import { useRouter } from 'next/navigation';
import { RobotForm } from '@/components/RobotForm';

export default function NewRobotPage() {
  const router = useRouter();
  return (
    <>
      <h1 className="text-xl font-semibold">Add robot</h1>
      <p className="text-sm text-zinc-400">The robot shows as offline until it connects to the ingestion service with the same id.</p>
      <RobotForm onSaved={(robot) => router.push(`/robots/${robot.id}`)} onCancel={() => router.push('/robots')} />
    </>
  );
}
