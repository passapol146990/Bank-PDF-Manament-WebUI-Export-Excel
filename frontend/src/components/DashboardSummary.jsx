import React, { useMemo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts'

const CATEGORY_COLORS = {
  'จ่ายพนักงาน': '#EF4444',
  'ซื้อของ': '#F97316',
  'ค่าสาธารณูปโภค': '#EAB308',
  'รายได้': '#22C55E',
  'โอนเงิน': '#3B82F6',
  'ค่าใช้จ่ายทั่วไป': '#8B5CF6',
  'Uncategorized': '#9CA3AF',
}

function getColor(category) {
  return CATEGORY_COLORS[category] || '#6B7280'
}

function formatCurrency(value) {
  if (value == null) return '฿0.00'
  return `฿${Number(value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function StatCard({ title, value, subtitle, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {subtitle && <p className="text-xs mt-1 opacity-60">{subtitle}</p>}
    </div>
  )
}

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold text-gray-800">{payload[0].name}</p>
        <p className="text-gray-600">{formatCurrency(payload[0].value)}</p>
      </div>
    )
  }
  return null
}

export default function DashboardSummary({ transactions = [] }) {
  const stats = useMemo(() => {
    const total = transactions.length
    const categorized = transactions.filter(t => t.category !== 'Uncategorized').length
    const totalWithdrawal = transactions.reduce((s, t) => s + (t.withdrawal || 0), 0)
    const totalDeposit = transactions.reduce((s, t) => s + (t.deposit || 0), 0)
    const uncategorizedAmount = transactions
      .filter(t => t.category === 'Uncategorized')
      .reduce((s, t) => s + (t.withdrawal || 0), 0)
    return { total, categorized, totalWithdrawal, totalDeposit, uncategorizedAmount }
  }, [transactions])

  const categorySummary = useMemo(() => {
    const map = {}
    transactions.forEach(t => {
      const cat = t.category || 'Uncategorized'
      if (!map[cat]) map[cat] = { category: cat, total_withdrawal: 0, total_deposit: 0, count: 0 }
      map[cat].total_withdrawal += t.withdrawal || 0
      map[cat].total_deposit += t.deposit || 0
      map[cat].count += 1
    })
    return Object.values(map).sort((a, b) => b.total_withdrawal - a.total_withdrawal)
  }, [transactions])

  const pieData = useMemo(() =>
    categorySummary.filter(c => c.total_withdrawal > 0).map(c => ({
      name: c.category,
      value: c.total_withdrawal,
    })),
    [categorySummary]
  )

  const progressPct = stats.total > 0
    ? Math.round((stats.categorized / stats.total) * 100)
    : 0

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">📊 Dashboard Summary</h2>
        <span className="text-sm text-gray-500">{stats.total} รายการทั้งหมด</span>
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">ความคืบหน้าการจัดหมวดหมู่</span>
          <span className="text-sm font-bold text-blue-600">
            {stats.categorized} / {stats.total} ({progressPct}%)
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="ยอดถอนรวม" value={formatCurrency(stats.totalWithdrawal)} color="red" />
        <StatCard title="ยอดฝากรวม" value={formatCurrency(stats.totalDeposit)} color="green" />
        <StatCard
          title="ยังไม่จัดหมวด"
          value={stats.total - stats.categorized}
          subtitle={`${formatCurrency(stats.uncategorizedAmount)} บาท`}
          color="yellow"
        />
        <StatCard
          title="จัดหมวดแล้ว"
          value={stats.categorized}
          subtitle={`${progressPct}% เสร็จแล้ว`}
          color="blue"
        />
      </div>

      {/* Charts */}
      {categorySummary.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {pieData.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">สัดส่วนการถอนตามหมวดหมู่</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) =>
                      percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''
                    }
                    labelLine={false}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={getColor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">ยอดรวมตามหมวดหมู่</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={categorySummary.slice(0, 7)}
                margin={{ top: 0, right: 10, left: 10, bottom: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} width={60} />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), '']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="total_withdrawal" name="ถอน" radius={[4, 4, 0, 0]}>
                  {categorySummary.slice(0, 7).map((entry, i) => (
                    <Cell key={i} fill={getColor(entry.category)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
