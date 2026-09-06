'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { exportMonthlyReport } from '@/lib/exportExcel'

type Props = {
  currentDate: string
  isOverBudgetToday: boolean
  grandTotal: number
  siteTotalStats: any
  sites: any[]
  selectedSiteId: string
  logData: any
  monthlyStats: any
  monthlyLoading: boolean
  monthName: string
}

export default function DashboardTab({
  currentDate, isOverBudgetToday, grandTotal, siteTotalStats, sites, selectedSiteId,
  logData, monthlyStats, monthlyLoading, monthName,
}: Props) {
  return (
    <div className="space-y-3 animate-fade-in">

      {/* 오늘의 요약 및 한계금액 분석 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="dash-card bg-[#fffdf7] border border-[#2e3192]/60 p-4">
          <h4 className="font-cond font-bold text-[#23255c] text-sm mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#2e3192] text-[18px]">calendar_today</span> 오늘의 지출 요약 ({currentDate})
          </h4>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center py-1.5 border-b border-[#2e3192]/20">
              <span className="text-[#6266a8] text-sm">일일 총 지출</span>
              <span className={`font-bold ${isOverBudgetToday ? 'text-red-600' : 'text-[#23255c]'}`}>₩{grandTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-[#2e3192]/20">
              <span className="text-[#6266a8] text-sm">일일 권장 투입 한계</span>
              <span className="font-bold text-[#5b6fd6]">₩{siteTotalStats ? Math.round(siteTotalStats.dailyLimit).toLocaleString() : 0}</span>
            </div>
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-[#6266a8] text-sm">상태 분석</span>
              {isOverBudgetToday ? (
                <span className="dash-pill text-red-600 font-bold text-xs bg-red-400/10 px-2 py-1">한계선 초과 (주의)</span>
              ) : (
                <span className="dash-pill text-[#2e3192] font-bold text-xs bg-[#eef1ff] px-2 py-1">안정적 (예산 내)</span>
              )}
            </div>
          </div>
        </div>

        <div className="dash-card bg-[#fffdf7] border border-[#2e3192]/60 p-4 flex items-center gap-4">
          <span className="material-symbols-outlined text-3xl text-[#8489c4] shrink-0">download</span>
          <div className="flex-1 min-w-0">
            <h4 className="font-cond font-bold text-[#23255c] text-sm mb-0.5">데이터 내보내기</h4>
            <p className="text-xs text-[#6266a8] mb-2 truncate">월간 작업일보 및 투입 비용 명세서 (.xlsx)</p>
            <button
              onClick={() => {
                const selectedSite = sites.find(s => s.id === selectedSiteId)
                const d = new Date(currentDate)
                const monthLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월`
                exportMonthlyReport(
                  selectedSite?.name || '현장',
                  monthLabel,
                  logData,
                  monthlyStats,
                  siteTotalStats
                )
              }}
              className="dash-sm py-1.5 px-4 bg-[#2e3192] text-[#fffdf7] text-sm font-bold transition-colors flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95"
            >
              <span className="material-symbols-outlined text-sm">file_download</span>
              엑셀 다운로드
            </button>
          </div>
        </div>
      </div>

      {/* 차트 + 월간 상세 분석: 넓은 화면에서는 좌우로 배치해 스크롤을 줄임 */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        {/* 일자별 지출 추이 바 차트 */}
        <div className="xl:col-span-3 dash-card bg-[#fffdf7] border border-[#2e3192]/60 p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-cond font-bold text-[#23255c] text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[#2e3192] text-[18px]">bar_chart</span>
              {monthName} 일자별 지출 추이
            </h3>
            <span className="text-[10px] text-[#6266a8]">단위: 원</span>
          </div>

          {monthlyLoading ? (
            <div className="h-56 flex items-center justify-center text-[#6266a8] text-sm">데이터를 불러오는 중...</div>
          ) : !monthlyStats?.dailyData || monthlyStats.dailyData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-[#6266a8] text-sm">입력된 데이터가 없습니다.</div>
          ) : (
            <div className="h-56 w-full xl:h-[26rem]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyStats.dailyData || []} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3192" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="name" stroke="#6266a8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6266a8" fontSize={11} tickFormatter={(val) => `₩${(val/10000).toFixed(0)}만`} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fffdf7', borderColor: '#2e3192', borderRadius: '10px' }}
                    itemStyle={{ fontSize: '13px' }}
                    formatter={(value: unknown) => [`₩${Number(value).toLocaleString()}`, undefined]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="노무비" stackId="a" fill="#2e3192" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="장비대" stackId="a" fill="#5b6fd6" />
                  <Bar dataKey="외주비" stackId="a" fill="#93a5f0" />
                  <Bar dataKey="경비" stackId="a" fill="#c9d3fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="xl:col-span-2 flex flex-col gap-3">
          {/* 지출 비중 원형 차트 */}
          <div className="dash-card bg-[#fffdf7] border border-[#2e3192]/60 p-4">
            <h4 className="font-cond font-bold text-[#23255c] text-sm mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#2e3192] text-[18px]">pie_chart</span> 카테고리별 지출 비중
            </h4>
            <div className="flex items-center gap-3">
              <div className="w-28 h-28 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: '노무', value: monthlyStats?.summary?.totalLabor || 0, color: '#2e3192' },
                        { name: '장비', value: monthlyStats?.summary?.totalEquipment || 0, color: '#5b6fd6' },
                        { name: '외주', value: monthlyStats?.summary?.totalOutsourcing || 0, color: '#93a5f0' },
                        { name: '경비', value: monthlyStats?.summary?.totalExpense || 0, color: '#c9d3fa' },
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={32}
                      outerRadius={48}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {[
                        { color: '#2e3192' },
                        { color: '#5b6fd6' },
                        { color: '#93a5f0' },
                        { color: '#c9d3fa' },
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#fffdf7', border: '1px solid #2e3192', borderRadius: '10px' }}
                      itemStyle={{ color: '#23255c' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 dash-pill bg-[#2e3192] shrink-0"></div>
                  <span className="text-[10px] text-[#6266a8] font-bold uppercase truncate">노무 {((monthlyStats?.summary?.totalLabor / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 dash-pill bg-[#5b6fd6] shrink-0"></div>
                  <span className="text-[10px] text-[#6266a8] font-bold uppercase truncate">장비 {((monthlyStats?.summary?.totalEquipment / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 dash-pill bg-[#93a5f0] shrink-0"></div>
                  <span className="text-[10px] text-[#6266a8] font-bold uppercase truncate">외주 {((monthlyStats?.summary?.totalOutsourcing / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 dash-pill bg-[#c9d3fa] shrink-0"></div>
                  <span className="text-[10px] text-[#6266a8] font-bold uppercase truncate">경비 {((monthlyStats?.summary?.totalExpense / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* 월간 상세 집계표 */}
          <div className="flex-1 dash-card bg-[#fffdf7] border border-[#2e3192]/60 p-4">
            <h4 className="font-cond font-bold text-[#23255c] text-sm mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#2e3192] text-[18px]">analytics</span> 월간 상세 집계표 ({monthName})
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#2e3192]/40 text-[9px] text-[#6266a8] font-bold uppercase tracking-widest">
                    <th className="pb-1.5 px-1">카테고리</th>
                    <th className="pb-1.5 px-1 text-right">금액</th>
                    <th className="pb-1.5 px-1 text-right">비중</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  <tr className="border-b border-[#2e3192]/20">
                    <td className="py-1.5 px-1 text-[#23255c] font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 dash-pill bg-[#2e3192] shrink-0"></span> 노무비
                    </td>
                    <td className="py-1.5 px-1 text-right text-[#23255c] font-bold">₩{(monthlyStats?.summary?.totalLabor || 0).toLocaleString()}</td>
                    <td className="py-1.5 px-1 text-right text-[#6266a8]">{((monthlyStats?.summary?.totalLabor / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                  </tr>
                  <tr className="border-b border-[#2e3192]/20">
                    <td className="py-1.5 px-1 text-[#23255c] font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 dash-pill bg-[#5b6fd6] shrink-0"></span> 장비대
                    </td>
                    <td className="py-1.5 px-1 text-right text-[#23255c] font-bold">₩{(monthlyStats?.summary?.totalEquipment || 0).toLocaleString()}</td>
                    <td className="py-1.5 px-1 text-right text-[#6266a8]">{((monthlyStats?.summary?.totalEquipment / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                  </tr>
                  <tr className="border-b border-[#2e3192]/20">
                    <td className="py-1.5 px-1 text-[#23255c] font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 dash-pill bg-[#93a5f0] shrink-0"></span> 외주비
                    </td>
                    <td className="py-1.5 px-1 text-right text-[#23255c] font-bold">₩{(monthlyStats?.summary?.totalOutsourcing || 0).toLocaleString()}</td>
                    <td className="py-1.5 px-1 text-right text-[#6266a8]">{((monthlyStats?.summary?.totalOutsourcing / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                  </tr>
                  <tr className="border-b border-[#2e3192]/20">
                    <td className="py-1.5 px-1 text-[#23255c] font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 dash-pill bg-[#c9d3fa] shrink-0"></span> 경비
                    </td>
                    <td className="py-1.5 px-1 text-right text-[#23255c] font-bold">₩{(monthlyStats?.summary?.totalExpense || 0).toLocaleString()}</td>
                    <td className="py-1.5 px-1 text-right text-[#6266a8]">{((monthlyStats?.summary?.totalExpense / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-[#2e3192]/5">
                    <td className="py-2 px-1 text-[#2e3192] font-bold">합계</td>
                    <td className="py-2 px-1 text-right text-[#2e3192] font-bold">₩{(monthlyStats?.summary?.grandTotal || 0).toLocaleString()}</td>
                    <td className="py-2 px-1 text-right text-[#2e3192] font-bold">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
  </div>
  )
}
