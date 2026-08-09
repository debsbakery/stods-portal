'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Recall {
  id: string
  product_name: string
  reason: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  date_from: string
  date_to: string
  status: 'initiated' | 'notifying' | 'resolved' | 'cancelled'
  initiated_at: string
  initiated_by: string | null
}

export default function RecallsPage() {
  const [recalls, setRecalls] = useState<Recall[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetchRecalls()
  }, [filter])

  async function fetchRecalls() {
    setLoading(true)
    try {
      const url = filter === 'all' 
        ? '/api/admin/recalls'
        : `/api/admin/recalls?status=${filter}`
      
      const res = await fetch(url)
      const data = await res.json()
      setRecalls(data.recalls || [])
    } catch (error) {
      console.error('Error fetching recalls:', error)
    } finally {
      setLoading(false)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300'
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'low': return 'bg-green-100 text-green-800 border-green-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'initiated': return 'bg-blue-100 text-blue-800'
      case 'notifying': return 'bg-purple-100 text-purple-800'
      case 'resolved': return 'bg-green-100 text-green-800'
      case 'cancelled': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Product Recalls</h1>
            <p className="text-gray-600 mt-2">Track and manage product recall notifications</p>
          </div>
          <Link 
            href="/admin/recalls/new"
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            + Create Recall
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Recalls
            </button>
            <button
              onClick={() => setFilter('initiated')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'initiated' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Initiated
            </button>
            <button
              onClick={() => setFilter('notifying')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'notifying' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Notifying
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'resolved' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Resolved
            </button>
          </div>
        </div>

        {/* Recalls List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading recalls...</p>
          </div>
        ) : recalls.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-600 text-lg">No recalls found</p>
            <p className="text-gray-500 mt-2">Create a new recall to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recalls.map((recall) => (
              <Link
                key={recall.id}
                href={`/admin/recalls/${recall.id}`}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${getSeverityColor(recall.severity)}`}>
                        {recall.severity}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(recall.status)}`}>
                        {recall.status}
                      </span>
                    </div>
                    
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {recall.product_name}
                    </h3>
                    
                    <p className="text-gray-700 mb-3 line-clamp-2">
                      {recall.reason}
                    </p>
                    
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <span>
                        <strong>Date Range:</strong> {new Date(recall.date_from).toLocaleDateString('en-AU')} - {new Date(recall.date_to).toLocaleDateString('en-AU')}
                      </span>
                      <span>
                        <strong>Initiated:</strong> {new Date(recall.initiated_at).toLocaleDateString('en-AU')}
                      </span>
                      {recall.initiated_by && (
                        <span>
                          <strong>By:</strong> {recall.initiated_by}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-blue-600 font-semibold hover:text-blue-800">
                      View Details →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}