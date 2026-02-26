'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

interface ProductFormProps {
  product?: {
    id: string;
    name: string;
    price: number;
    description?: string;
    category?: string;
    image_url?: string;
    code?: string; // ✅ Added
  };
  isEditing?: boolean;
}

export default function ProductForm({ product, isEditing = false }: ProductFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: product?.name || '',
    price: product?.price?.toString() || '',
    description: product?.description || '',
    category: product?.category || '',
    image_url: product?.image_url || '',
    code: product?.code || '', // ✅ Added
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(product?.image_url || '');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setImageFile(file);
    setError('');

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return formData.image_url || null;

    setUploading(true);
    try {
      // Create unique filename
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase Storage
      const formDataUpload = new FormData();
      formDataUpload.append('file', imageFile);
      formDataUpload.append('fileName', fileName);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formDataUpload,
      });

      const data = await response.json();

      if (data.error) throw new Error(data.error);

      return data.imageUrl;
    } catch (err: any) {
      console.error('Image upload error:', err);
      setError(`Image upload failed: ${err.message}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Upload image first if there's a new one
      let imageUrl = formData.image_url;
      if (imageFile) {
        const uploadedUrl = await uploadImage();
        if (!uploadedUrl) {
          throw new Error('Image upload failed');
        }
        imageUrl = uploadedUrl;
      }

      const url = isEditing ? `/api/products/${product?.id}` : '/api/products';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          image_url: imageUrl,
          code: formData.code || null, // ✅ Include code
        }),
      });

      const data = await response.json();

      if (data.error) throw new Error(data.error);

      router.push('/admin/products');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview('');
    setFormData({ ...formData, image_url: '' });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700 font-semibold">❌ Error</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Product Name */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Product Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
          placeholder="Sourdough Bread"
          required
        />
      </div>

      {/* ✅ Product Code - NEW FIELD */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Product Code
        </label>
        <input
          type="text"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-lg"
          placeholder="e.g., 1001, 2050, 900"
        />
        <div className="mt-2 p-3 bg-gray-50 rounded-md border border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-2">💡 Code Range Guide:</p>
          // ✅ Replace the guide grid with:
<div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
  <div className="flex items-center gap-1">
    <span className="font-mono font-bold text-pink-700">1000-1999</span>
    <span className="text-gray-600">🎂 Cakes</span>
  </div>
  <div className="flex items-center gap-1">
    <span className="font-mono font-bold text-amber-700">2000-2750</span>
    <span className="text-gray-600">🍞 Bread</span>
  </div>
  <div className="flex items-center gap-1">
    <span className="font-mono font-bold text-orange-700">2751-3750</span>
    <span className="text-gray-600">🥖 Rolls</span>
  </div>
  <div className="flex items-center gap-1">
    <span className="font-mono font-bold text-yellow-700">3751-4000</span>
    <span className="text-gray-600">🥧 Pies</span>
  </div>
  <div className="flex items-center gap-1">
    <span className="font-mono font-bold text-gray-700">4001+</span>
    <span className="text-gray-600">🧁 Other</span>
  </div>
  <div className="flex items-center gap-1">
    <span className="font-mono font-bold text-blue-700">900</span>
    <span className="text-gray-600">⚙️ Admin</span>
  </div>
</div>

      {/* ✅ Special Notice for Code 900 */}
      {formData.code === '900' && (
        <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-md">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚙️</div>
            <div>
              <p className="text-sm font-semibold text-blue-900 mb-1">
                Administrative Product (Code 900)
              </p>
              <p className="text-xs text-blue-700 leading-relaxed">
                This product allows <strong>custom descriptions</strong> and <strong>custom prices</strong> when adding to orders. 
                Perfect for credits, stales, damaged goods, delivery charges, and one-off adjustments.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium mb-2">Product Image</label>
        
        {imagePreview ? (
          <div className="relative">
            <img
              src={imagePreview}
              alt="Product preview"
              className="w-full max-w-sm h-64 object-cover rounded-lg border-2 border-gray-300"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-500 transition-colors">
            <ImageIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
            <label className="cursor-pointer">
              <span className="text-green-600 hover:text-green-700 font-semibold">
                Click to upload
              </span>
              <span className="text-gray-500"> or drag and drop</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
            <p className="text-xs text-gray-500 mt-2">PNG, JPG, GIF up to 5MB</p>
          </div>
        )}

        {/* Or paste URL */}
        <div className="mt-3">
          <p className="text-xs text-gray-600 mb-2">Or paste an image URL:</p>
          <input
            type="url"
            value={formData.image_url}
            onChange={(e) => {
              setFormData({ ...formData, image_url: e.target.value });
              setImagePreview(e.target.value);
            }}
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="https://example.com/image.jpg"
          />
        </div>
      </div>

      {/* Price */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Price <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-gray-500 font-semibold">$</span>
          <input
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            className="w-full pl-8 pr-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
            placeholder="5.50"
            required
          />
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium mb-2">Category</label>
        <input
          type="text"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
          placeholder="Bread, Pastries, etc."
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
          rows={3}
          placeholder="Product description..."
        />
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4 border-t">
        <button
          type="submit"
          disabled={loading || uploading}
          className="flex-1 px-6 py-3 rounded-md text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          style={{ backgroundColor: "#006A4E" }}
        >
          {uploading ? (
            '⏳ Uploading image...'
          ) : loading ? (
            '💾 Saving...'
          ) : isEditing ? (
            '✅ Update Product'
          ) : (
            '✨ Create Product'
          )}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading || uploading}
          className="px-6 py-3 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}