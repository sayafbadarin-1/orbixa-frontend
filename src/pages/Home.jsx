import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const [products, setProducts] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    axios.get('https://orbixa-backend.onrender.com/api/products')
      .then(res => setProducts(res.data.data))
      .catch(err => console.error(err))
  }, [])

  return (
    <div>
      <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>أحدث المنتجات</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {products.map(p => (
          <div key={p._id} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            {p.image && <img src={p.image} alt={p.name_ar} style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px' }} />}
            <h3>{p.name_ar}</h3>
            <p style={{ color: '#666' }}>{p.desc_ar}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{p.price} ₪</span>
              <button 
                onClick={() => navigate(`/checkout/${p.sku}?price=${p.price}`)}
                style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                شراء الآن
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
