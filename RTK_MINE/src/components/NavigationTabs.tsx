import React from 'react';
import { 
  Crosshair, 
  Compass, 
  Map as MapIcon, 
  ListFilter, 
  Settings as SettingsIcon 
} from 'lucide-react';

export type ActiveTab = 'SURVEY' | 'STAKEOUT' | 'CAD_MAP' | 'POINTS' | 'SETTINGS';

interface NavigationTabsProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  pointsCount: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onChangeTab,
  pointsCount
}) => {
  const tabs = [
    { id: 'SURVEY' as ActiveTab, label: '수치측량', icon: Crosshair },
    { id: 'STAKEOUT' as ActiveTab, label: '3D 측설', icon: Compass },
    { id: 'CAD_MAP' as ActiveTab, label: 'CAD 도면', icon: MapIcon },
    { id: 'POINTS' as ActiveTab, label: '성과목록', icon: ListFilter, badge: pointsCount },
    { id: 'SETTINGS' as ActiveTab, label: '장비설정', icon: SettingsIcon },
  ];

  return (
    <div className="w-full bg-[#ebf0f7] px-2.5 pt-1.5 pb-2 border-t border-white/70 shadow-[0_-3px_12px_rgba(166,175,195,0.25)] select-none z-50 safe-bottom">
      <nav className="neu-flat rounded-2xl sm:rounded-3xl p-1 flex items-center justify-around">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-0.5 rounded-xl sm:rounded-2xl transition-all relative ${
                isActive 
                  ? 'neu-inset text-cyan-700 font-black' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 mb-0.5 transition-transform ${isActive ? 'scale-110 text-cyan-600' : ''}`} />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-3 bg-cyan-500 text-white font-black text-[9px] px-1.5 py-0.2 rounded-full shadow-sm">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] sm:text-[11px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
