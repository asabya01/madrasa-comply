import { Bell, User } from 'lucide-react';
import { useSchoolStore } from '../../stores/schoolStore';

export function TopBar({ title }: { title: string }) {
  const { profile, academicYear } = useSchoolStore();

  return (
    <header className="h-14 border-b border-[#e2e0db] bg-white flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-[#1a1a1a] font-sans">{title}</h1>
      <div className="flex items-center gap-4">
        <span className="text-xs text-[#6b7280] bg-gray-100 px-2 py-1 rounded">
          {academicYear}
        </span>
        <button className="relative p-1 text-[#6b7280] hover:text-[#1a1a1a]">
          <Bell className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-[#01696f] flex items-center justify-center">
            <User className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm text-[#1a1a1a] hidden sm:block">
            {profile?.full_name || 'User'}
          </span>
        </div>
      </div>
    </header>
  );
}
