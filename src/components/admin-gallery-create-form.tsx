"use client";

import { useState } from "react";

import type { GalleryCategory, GalleryVisibility } from "@prisma/client";

type AdminGalleryCreateFormProps = {
  categoryLabels: Record<GalleryCategory, string>;
  categoryOptions: GalleryCategory[];
  initialCategory: GalleryCategory;
  mainCategoryOptions: GalleryCategory[];
  visibilityOptions: GalleryVisibility[];
};

export function AdminGalleryCreateForm({
  categoryLabels,
  categoryOptions,
  initialCategory,
  mainCategoryOptions,
  visibilityOptions,
}: AdminGalleryCreateFormProps) {
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const selectedCategoryLabel = categoryLabels[selectedCategory];

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        {mainCategoryOptions.map((category) => (
          <button
            key={category}
            aria-pressed={category === selectedCategory}
            className={`rounded border px-3 py-1.5 text-xs font-medium transition ${
              category === selectedCategory ? "border-black bg-black text-white" : "bg-white hover:bg-neutral-50"
            }`}
            style={
              category === selectedCategory
                ? {
                    backgroundColor: "#050505",
                    borderColor: "#050505",
                    color: "#ffffff",
                  }
                : undefined
            }
            type="button"
            onClick={() => setSelectedCategory(category)}
          >
            {categoryLabels[category]}
          </button>
        ))}
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-2" action="/admin/actions/galleries/create" method="post">
        <input type="hidden" name="redirectCategory" value={selectedCategory} />
        <input className="rounded border px-3 py-2 text-sm" name="title" placeholder="Gallery title" required />
        <input className="rounded border px-3 py-2 text-sm" name="slug" placeholder="gallery-slug" required />
        <select
          className="rounded border px-3 py-2 text-sm"
          name="category"
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.currentTarget.value as GalleryCategory)}
        >
          {categoryOptions.map((option) => (
            <option key={option} value={option}>
              {categoryLabels[option]}
            </option>
          ))}
        </select>
        <select className="rounded border px-3 py-2 text-sm" name="visibility" defaultValue="PUBLIC">
          {visibilityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <textarea
          className="rounded border px-3 py-2 text-sm md:col-span-2"
          name="description"
          placeholder="Description"
          rows={3}
        />
        <button className="rounded bg-black px-4 py-2 text-sm font-medium text-white md:col-span-2" type="submit">
          Create {selectedCategoryLabel} gallery
        </button>
      </form>
    </>
  );
}
