import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import NewOrder from "./pages/NewOrder";
import Products from "./pages/Products";
import Coupons from "./pages/Coupons";
import Rules from "./pages/Rules";
import Banners from "./pages/Banners";
import Contacts from "./pages/Contacts";
import SettingsPage from "./pages/Settings";
import Launch from "./pages/Launch";
import Login from "./pages/Login";
import DeliveryApp from "./delivery/DeliveryApp";
import CustomerApp from "./customer/CustomerApp";
import { useAuth, auth } from "./lib/apiClient";
import { store } from "./lib/data";

// Shown in the footer. Bump on release.
const APP_VERSION = "0.1.0";

function Sidebar() {
  const [open, setOpen] = useState(false);
  const link = ({ isActive }: { isActive: boolean }) =>
    isActive ? "active" : "";
  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="side-top">
        <div className="brand">
          <div className="mark">M</div>
          <div>
            <div className="name">Marrow<b> Fresh</b></div>
            <div className="tag">ALWAYS FRESH · NEVER FROZEN</div>
          </div>
        </div>
        <button className="sidebar-toggle" aria-label="Toggle menu" onClick={() => setOpen((o) => !o)}>☰</button>
      </div>
      <nav className="nav" onClick={() => setOpen(false)}>
        <NavLink to="/" end className={link}>📊 Dashboard</NavLink>
        <NavLink to="/new" className={link}>➕ New Order</NavLink>
        <NavLink to="/orders" className={link}>🧾 Orders</NavLink>
        <NavLink to="/products" className={link}>🥩 Products</NavLink>
        <NavLink to="/coupons" className={link}>🎟️ Coupons</NavLink>
        <NavLink to="/rules" className={link}>📐 Rules</NavLink>
        <NavLink to="/banners" className={link}>🖼️ Banners</NavLink>
        <NavLink to="/contacts" className={link}>📇 Contacts</NavLink>
        <NavLink to="/settings" className={link}>⚙️ Settings</NavLink>
        <NavLink to="/launch" className={link}>🚀 Launch</NavLink>
      </nav>
      <a className="open-delivery" href="#/shop" target="_blank" rel="noreferrer">
        🛒 Open Customer site →
      </a>
      <a className="open-delivery" href="#/delivery" target="_blank" rel="noreferrer">
        🛵 Open Delivery app →
      </a>
      <div className="side-foot">
        <div className="muted" style={{ marginBottom: 6 }}>{auth.email()}</div>
        <button className="btn sm" onClick={() => auth.logout()}>Sign out</button>
      </div>
    </aside>
  );
}

function AdminLayout() {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewOrder />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/products" element={<Products />} />
          <Route path="/coupons" element={<Coupons />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/banners" element={<Banners />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/launch" element={<Launch />} />
        </Routes>
      </main>

      {/* Standard application footer — identical on every screen, fixed to the
          bottom of the viewport so it never moves with page data or scrolling. */}
      <footer className="app-footer">
        <span>© {new Date().getFullYear()} Marrow Fresh · Admin</span>
        <span className="dot">·</span>
        <span>Always fresh · Never frozen</span>
        <span className="foot-right">v{APP_VERSION}</span>
      </footer>
    </div>
  );
}

export default function App() {
  const token = useAuth();

  // While signed in: pull orders now, then poll every 15s so new orders appear
  // live without a manual refresh. Also ask once for notification permission.
  useEffect(() => {
    if (!token) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    store.refreshOrders();
    const iv = setInterval(() => store.refreshOrders(), 5000);
    return () => clearInterval(iv);
  }, [token]);

  return (
    <Routes>
      {/* The delivery app has its own phone + PIN login, and the storefront is
          public — neither may sit behind the admin gate. */}
      <Route path="/delivery/*" element={<DeliveryApp />} />
      <Route path="/shop/*" element={<CustomerApp />} />
      <Route path="/*" element={token ? <AdminLayout /> : <Login />} />
    </Routes>
  );
}
