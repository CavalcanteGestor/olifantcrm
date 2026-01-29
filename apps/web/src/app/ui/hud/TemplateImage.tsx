"use client";

import { useState, useEffect } from "react";
import { Image as ImageIcon } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiGetMediaUrl } from "@/lib/api";

type TemplateImageProps = {
  context: any;
  accessToken: string;
  messageId?: string;
};

export default function TemplateImage({ context, accessToken, messageId }: TemplateImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLightbox, setShowLightbox] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      // 1. Prioridade: Imagem baixada pelo worker (se existir)
      // Buscar no nível raiz do body_json (não dentro de context)
      if (messageId) {
        try {
          const { data: asset } = await supabaseBrowser()
            .from("media_assets")
            .select("id")
            .eq("message_id", messageId)
            .ilike("meta_media_id", "ad_%") // Convenção usada no worker
            .maybeSingle();

          if (asset && alive) {
            const urlData = await apiGetMediaUrl({ accessToken, mediaId: (asset as any).id });
            if (urlData && urlData.url) {
              setImageUrl(urlData.url);
              setLoading(false);
              setError(null);
              return;
            }
          }
        } catch (err) {
          console.error("Erro ao carregar imagem de anúncio salva:", err);
        }
      }

      // 2. Fallback: URL do contexto (pode sofrer de expire/auth)
      let imgUrl: string | null = null;

      // Tentar diferentes caminhos onde a imagem pode estar
      if (context?.referred_product?.image_url) {
        imgUrl = context.referred_product.image_url;
      } else if (context?.referred_product?.image) {
        imgUrl = typeof context.referred_product.image === 'string'
          ? context.referred_product.image
          : context.referred_product.image.url || context.referred_product.image.link;
      } else if (context?.referred_product?.product_retailer_id) {
        // Se tem product_retailer_id, pode ter imagem em outro lugar
        imgUrl = context.referred_product.image_url || context.referred_product.image?.url;
      } else if (context?.ad?.image_url) {
        imgUrl = context.ad.image_url;
      } else if (context?.ad?.image) {
        imgUrl = typeof context.ad.image === 'string'
          ? context.ad.image
          : context.ad.image.url || context.ad.image.link;
      } else if (context?.message?.image?.url) {
        imgUrl = context.message.image.url;
      } else if (context?.message?.image) {
        imgUrl = typeof context.message.image === 'string'
          ? context.message.image
          : context.message.image.url || context.message.image.link;
      } else if (context?.header?.image?.url) {
        imgUrl = context.header.image.url;
      } else if (context?.header?.image) {
        imgUrl = typeof context.header.image === 'string'
          ? context.header.image
          : context.header.image.url || context.header.image.link;
      } else if (context?.header?.image_url) {
        imgUrl = context.header.image_url;
      } else if (context?.image_url) {
        imgUrl = context.image_url;
      } else if (context?.image) {
        imgUrl = typeof context.image === 'string' ? context.image : context.image.url || context.image.link;
      } else if (context?.media?.image?.url) {
        imgUrl = context.media.image.url;
      } else if (context?.media?.image) {
        imgUrl = typeof context.media.image === 'string'
          ? context.media.image
          : context.media.image.url || context.media.image.link;
      } else if (context?.referral?.image_url) {
        imgUrl = context.referral.image_url;
      } else if (context?.referral?.thumbnail_url) {
        imgUrl = context.referral.thumbnail_url;
      } else if (context?.referral?.video_url) {
        imgUrl = context.referral.video_url; // Tentativa de usar vídeo como poster
      } else if (context?.advertisement?.image_url) {
        imgUrl = context.advertisement.image_url;
      }

      if (alive) {
        if (imgUrl) {
          setImageUrl(imgUrl);
          setError(null);
        } else {
          // Log para debug (apenas em desenvolvimento)
          if (process.env.NODE_ENV === 'development') {
            console.log('TemplateImage: Nenhuma imagem encontrada no context:', context);
          }
        }
        setLoading(false);
      }
    };

    load();

    return () => { alive = false; };
  }, [context, messageId, accessToken]);

  // Tentar carregar a imagem com autenticação se falhar
  const handleImageError = async () => {
    if (!imageUrl || !accessToken) {
      setError("Imagem não disponível");
      return;
    }

    // Se a URL é do WhatsApp (mmg.whatsapp.net), pode precisar de autenticação
    if (imageUrl.includes('mmg.whatsapp.net') || imageUrl.includes('scontent')) {
      setError("Imagem expirada ou requer autenticação.");
    } else {
      setError("Erro ao carregar imagem.");
    }
  };

  if (loading) {
    return (
      <div className="w-full h-32 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse flex items-center justify-center mb-3">
        <ImageIcon className="w-6 h-6 text-gray-400" />
      </div>
    );
  }

  // Se não achou URL ou deu erro, mas tem contexto de anúncio, mostrar placeholder
  if (!imageUrl || error) {
    const isAd = context?.ad || context?.referral || context?.advertisement;
    if (isAd) {
      return (
        <div className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
            <ImageIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Anúncio: {context?.ad?.title || context?.referral?.headline || "Sem título"}
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">
              {error || "Imagem indisponível"}
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      <div className="relative group mb-3 w-full overflow-hidden rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-950 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 max-w-[280px] sm:max-w-xs">
        {/* Header - Glassmorphism Style */}
        <div className="px-3 py-2 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30 backdrop-blur-md border-b border-gray-100 dark:border-gray-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-sm ring-2 ring-white/20">
              <ImageIcon className="w-3 h-3" />
            </div>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider truncate">
              {context?.ad?.title || context?.referral?.headline || "Anúncio do WhatsApp"}
            </span>
          </div>
        </div>

        {/* Image Container with Zoom effect */}
        <div className="relative bg-gray-50 dark:bg-black/20 flex items-center justify-center aspect-video overflow-hidden">
          <img
            src={imageUrl}
            alt={context?.ad?.title || context?.referral?.headline || "Imagem do anúncio"}
            className="w-full h-full object-cover cursor-pointer transition-all duration-700 ease-in-out group-hover:scale-110"
            onClick={() => setShowLightbox(true)}
            onError={handleImageError}
            loading="lazy"
          />
          {/* Subtle Overlay & Play icon hint if it was a referral video */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          {/* Badge indicator */}
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[8px] text-white font-medium uppercase tracking-widest border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            Expandir
          </div>
        </div>

        {/* Body Content */}
        {(context?.ad?.body || context?.referral?.body) && (
          <div className="p-3 bg-white dark:bg-gray-950/40">
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2 italic font-serif">
              "{context?.ad?.body || context?.referral?.body}"
            </p>
          </div>
        )}
      </div>

      {/* Lightbox / Fullscreen */}
      {showLightbox && (
        <div
          className="fixed inset-0 bg-black/90 dark:bg-black/95 backdrop-blur-md z-[9999] flex items-center justify-center p-4 transition-all duration-300"
          onClick={() => setShowLightbox(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] animate-in zoom-in-95 duration-300 ease-out">
            <img
              src={imageUrl}
              alt="Imagem do anúncio"
              className="max-h-[90vh] max-w-full rounded-2xl shadow-2xl object-contain border border-white/10"
              onClick={(e) => e.stopPropagation()}
            />
            {/* Close button in lightbox */}
            <button
              className="absolute -top-4 -right-4 w-10 h-10 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
              onClick={() => setShowLightbox(false)}
            >
              <span className="text-xl font-light">×</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
