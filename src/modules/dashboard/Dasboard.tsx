import React from 'react';
import { TrendingUp, ShoppingCart, Package, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardContent, Badge, Button } from '@/components/ui/components';

// Datos de ejemplo
const salesData = [
  { month: 'Ene', sales: 4000, orders: 240 },
  { month: 'Feb', sales: 3000, orders: 221 },
  { month: 'Mar', sales: 2000, orders: 229 },
  { month: 'Abr', sales: 2780, orders: 200 },
  { month: 'May', sales: 1890, orders: 229 },
  { month: 'Jun', sales: 2390, orders: 200 },
];

const recentOrders = [
  { id: 'ORD-001', customer: 'Juan García', amount: '$245.50', status: 'Completada', time: 'Hace 2 horas' },
  { id: 'ORD-002', customer: 'María López', amount: '$189.00', status: 'En preparación', time: 'Hace 30 min' },
  { id: 'ORD-003', customer: 'Carlos Rodríguez', amount: '$320.75', status: 'Completada', time: 'Hace 1 hora' },
  { id: 'ORD-004', customer: 'Ana Martínez', amount: '$156.25', status: 'Pendiente', time: 'Hace 15 min' },
];

const StatCard = ({ icon: Icon, title, value, change, trend }: any) => (
  <Card className="flex flex-col">
    <CardContent className="flex items-start justify-between pt-6">
      <div className="flex-1">
        <p className="text-sm text-gray-600 mb-1">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <div className="flex items-center mt-2">
          {trend === 'up' ? (
            <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-red-500 mr-1" />
          )}
          <span className={`text-xs font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
            {change}
          </span>
        </div>
      </div>
      <div className="w-12 h-12 rounded-lg bg-brand-50 flex items-center justify-center">
        <Icon className="w-6 h-6 text-brand-500" />
      </div>
    </CardContent>
  </Card>
);

export const Dashboard = () => {
  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Bienvenido a NexoERP. Aquí está el resumen de tu negocio.</p>
      </div>

      {/* Tarjetas de Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={DollarSign} 
          title="Ventas Hoy" 
          value="$2,450" 
          change="+12.5%" 
          trend="up" 
        />
        <StatCard 
          icon={ShoppingCart} 
          title="Órdenes" 
          value="24" 
          change="+8.2%" 
          trend="up" 
        />
        <StatCard 
          icon={Package} 
          title="Productos Bajo Stock" 
          value="12" 
          change="-3.1%" 
          trend="down" 
        />
        <StatCard 
          icon={TrendingUp} 
          title="Ticket Promedio" 
          value="$102.08" 
          change="+5.4%" 
          trend="up" 
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Líneas - Ventas */}
        <Card>
          <CardHeader title="Ventas Últimos 6 Meses" />
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ fill: '#10b981', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico de Barras - Órdenes */}
        <Card>
          <CardHeader title="Órdenes por Mes" />
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Bar dataKey="orders" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Órdenes Recientes */}
      <Card>
        <CardHeader 
          title="Órdenes Recientes" 
          action={<Button variant="outline" size="sm">Ver todas</Button>}
        />
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">ID Orden</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Cliente</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Monto</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Estado</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Hora</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{order.id}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{order.customer}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-gray-900">{order.amount}</td>
                    <td className="py-3 px-4 text-sm">
                      <Badge variant={
                        order.status === 'Completada' ? 'success' : 
                        order.status === 'En preparación' ? 'warning' : 
                        'info'
                      }>
                        {order.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{order.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;