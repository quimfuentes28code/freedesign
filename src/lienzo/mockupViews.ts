// Generado por scripts/mockup-views.mjs: los dibujos de la hoja de mockups que usa cada prenda del catálogo al
// empezar un diseño (delante y detrás por separado, para encajar cada vista con la prenda 3D).
export interface MockupView {
  /** Ruta pública de la imagen. */
  file: string
  /** Alto / ancho. */
  aspect: number
}

export const MOCKUP_VIEWS: Record<string, { front?: MockupView; back?: MockupView }> = {
  "sudadera": {
    "front": {
      "file": "/mockups/sudadera-capucha-delante.png",
      "aspect": 1.3534
    },
    "back": {
      "file": "/mockups/sudadera-capucha-detras.png",
      "aspect": 1.3392
    }
  },
  "camiseta": {
    "front": {
      "file": "/mockups/camiseta-delante.png",
      "aspect": 0.9618
    },
    "back": {
      "file": "/mockups/camiseta-detras.png",
      "aspect": 0.9424
    }
  },
  "camiseta-ml": {
    "front": {
      "file": "/mockups/camiseta-ml-delante.png",
      "aspect": 0.965
    },
    "back": {
      "file": "/mockups/camiseta-ml-detras.png",
      "aspect": 0.9343
    }
  },
  "polo": {
    "front": {
      "file": "/mockups/polo-delante.png",
      "aspect": 1.1289
    },
    "back": {
      "file": "/mockups/polo-detras.png",
      "aspect": 1.1397
    }
  },
  "polo-ml": {
    "front": {
      "file": "/mockups/polo-ml-delante.png",
      "aspect": 1.0967
    },
    "back": {
      "file": "/mockups/polo-ml-detras.png",
      "aspect": 1.0868
    }
  },
  "camisa-mc": {
    "front": {
      "file": "/mockups/camisa-mc-delante.png",
      "aspect": 1.2047
    },
    "back": {
      "file": "/mockups/camisa-mc-detras.png",
      "aspect": 1.1927
    }
  },
  "bomber": {
    "front": {
      "file": "/mockups/bomber-delante.png",
      "aspect": 1.0119
    },
    "back": {
      "file": "/mockups/bomber-detras.png",
      "aspect": 1.0119
    }
  },
  "puffer": {
    "front": {
      "file": "/mockups/puffer-delante.png",
      "aspect": 0.9564
    },
    "back": {
      "file": "/mockups/puffer-detras.png",
      "aspect": 0.9461
    }
  },
  "chaleco": {
    "front": {
      "file": "/mockups/chaleco-delante.png",
      "aspect": 1.4774
    },
    "back": {
      "file": "/mockups/chaleco-espalda-detras.png",
      "aspect": 1.5021
    }
  },
  "cazadora": {
    "front": {
      "file": "/mockups/cazadora-vaquera-delante.png",
      "aspect": 1.1692
    },
    "back": {
      "file": "/mockups/cazadora-vaquera-detras.png",
      "aspect": 1.1552
    }
  },
  "cortavientos": {
    "front": {
      "file": "/mockups/chandal-chaqueta-delante.png",
      "aspect": 1.0117
    },
    "back": {
      "file": "/mockups/chandal-chaqueta-detras.png",
      "aspect": 1.0236
    }
  },
  "pantalon": {
    "front": {
      "file": "/mockups/jogger-delante.png",
      "aspect": 1.9617
    },
    "back": {
      "file": "/mockups/jogger-detras.png",
      "aspect": 1.9198
    }
  },
  "chandal": {
    "front": {
      "file": "/mockups/chandal-pantalon-delante.png",
      "aspect": 2.6725
    },
    "back": {
      "file": "/mockups/chandal-pantalon-detras.png",
      "aspect": 2.6495
    }
  },
  "pantalon-ancho": {
    "front": {
      "file": "/mockups/vaquero-delante.png",
      "aspect": 2.4476
    },
    "back": {
      "file": "/mockups/vaquero-detras.png",
      "aspect": 2.3918
    }
  },
  "pantalon-corto": {
    "front": {
      "file": "/mockups/shorts-delante.png",
      "aspect": 0.9841
    },
    "back": {
      "file": "/mockups/shorts-detras.png",
      "aspect": 0.9871
    }
  },
  "shorts": {
    "front": {
      "file": "/mockups/short-vaquero-delante.png",
      "aspect": 1.0697
    },
    "back": {
      "file": "/mockups/short-vaquero-detras.png",
      "aspect": 1.0697
    }
  },
  "top": {
    "front": {
      "file": "/mockups/tirantes-delante.png",
      "aspect": 1.6108
    },
    "back": {
      "file": "/mockups/tirantes-espalda-detras.png",
      "aspect": 1.5797
    }
  },
  "gorro": {
    "front": {
      "file": "/mockups/gorro-delante.png",
      "aspect": 0.8147
    }
  },
  "gorra": {
    "front": {
      "file": "/mockups/gorra-delante.png",
      "aspect": 0.8416
    },
    "back": {
      "file": "/mockups/gorra-detras.png",
      "aspect": 0.6658
    }
  }
}
